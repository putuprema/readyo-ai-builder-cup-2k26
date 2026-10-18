import {
  type Analysis,
  firestorePaths,
  type Goal,
  type MonthRecord,
  type Override,
  type RuleValue,
  type RunStatus,
  type Transaction,
  type UserRecord,
} from "@adidi/shared";
import { type App, getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { ExtractedRecords, RecordsPort, StoragePort } from "../extraction/ports.js";
import type { RunStore } from "../pipeline/ports.js";

// Cloud Run adapters for the extraction ports. Firebase Admin uses Application Default
// Credentials (the Cloud Run service account; `gcloud auth application-default login` locally).
// With FIRESTORE_EMULATOR_HOST / FIREBASE_STORAGE_EMULATOR_HOST set, the emulators are used.

let app: App | undefined;

export function firebaseApp(): App {
  if (!app) {
    app =
      getApps()[0] ??
      initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT,
        storageBucket: process.env.STORAGE_BUCKET,
      });
  }
  return app;
}

// Downloads skip `file.download()`: its stream path stacks three pipelines (node-fetch,
// teeny-request, the Storage client) on one response body, and every download logged
// MaxListenersExceededWarning (11 error and close listeners on a PassThrough). One media GET
// read into a buffer replaces exists() + getMetadata() + download(): three round trips become
// one, a 404 means the object is missing, and the Content-Type header is the object's.
const DOWNLOAD_ATTEMPTS = 3;
const DOWNLOAD_TIMEOUT_MS = 60_000;

export function cloudStorage(bucketName = process.env.STORAGE_BUCKET): StoragePort {
  const bucket = getStorage(firebaseApp()).bucket(bucketName);
  const client = bucket.storage;
  // The emulator (STORAGE_EMULATOR_HOST) takes unauthenticated requests, as the client does.
  const authenticate = !client.customEndpoint || client.useAuthWithCustomEndpoint === true;
  return {
    async download(path) {
      const url = `${client.baseUrl}/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(path)}?alt=media`;
      for (let attempt = 1; ; attempt++) {
        let response: Response;
        try {
          const headers = authenticate ? await client.authClient.getRequestHeaders(url) : {};
          response = await fetch(url, {
            headers,
            signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
          });
        } catch (error) {
          if (attempt < DOWNLOAD_ATTEMPTS) continue;
          throw new Error("Storage download failed", { cause: error });
        }
        if (response.status === 404) return null;
        if (response.ok) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          const contentType = response.headers.get("content-type") ?? undefined;
          return { bytes, ...(contentType ? { contentType } : {}) };
        }
        await response.body?.cancel();
        const retriable = response.status === 429 || response.status >= 500;
        if (!retriable || attempt >= DOWNLOAD_ATTEMPTS) {
          throw new Error(`Storage download failed with HTTP ${response.status}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    },
    async delete(path) {
      await bucket.file(path).delete({ ignoreNotFound: true });
    },
  };
}

const BATCH_LIMIT = 500;

export function firestoreRecords(db: Firestore = getFirestore(firebaseApp())): RecordsPort {
  return {
    async getDocument(uid, documentId) {
      const snap = await db.doc(firestorePaths.document(uid, documentId)).get();
      if (!snap.exists) return null;
      return { id: snap.id, ...(snap.data() as object) } as Awaited<
        ReturnType<RecordsPort["getDocument"]>
      >;
    },
    async updateDocument(uid, documentId, patch) {
      await db.doc(firestorePaths.document(uid, documentId)).set(patch, { merge: true });
    },
    async writeRecords(uid, records) {
      const writes: { path: string; data: object }[] = [
        ...records.transactions.map((t) => ({
          path: firestorePaths.transaction(uid, t.id),
          data: t,
        })),
        ...records.loans.map((l) => ({ path: firestorePaths.loan(uid, l.id), data: l })),
        ...records.holdings.map((h) => ({ path: firestorePaths.holding(uid, h.id), data: h })),
      ];
      for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
        const batch = db.batch();
        for (const write of writes.slice(i, i + BATCH_LIMIT))
          batch.set(db.doc(write.path), write.data);
        await batch.commit();
      }
    },
    async readRecordsForFile(uid, documentId) {
      const read = async <T>(collection: string): Promise<T[]> => {
        const snap = await db
          .collection(`${firestorePaths.user(uid)}/${collection}`)
          .where("sourceFileId", "==", documentId)
          .get();
        return snap.docs.map((d) => d.data() as T);
      };
      const [transactions, loans, holdings] = await Promise.all([
        read<ExtractedRecords["transactions"][number]>("transactions"),
        read<ExtractedRecords["loans"][number]>("loans"),
        read<ExtractedRecords["holdings"][number]>("holdings"),
      ]);
      return { transactions, loans, holdings };
    },
    async listTransactionsBefore(uid, month) {
      const snap = await db
        .collection(`${firestorePaths.user(uid)}/transactions`)
        .where("month", "<", month)
        .get();
      return snap.docs.map((d) => d.data() as Transaction);
    },
    async deleteTransactions(uid, ids) {
      for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
        const batch = db.batch();
        for (const id of ids.slice(i, i + BATCH_LIMIT))
          batch.delete(db.doc(firestorePaths.transaction(uid, id)));
        await batch.commit();
      }
    },
  };
}

// Firestore adapter for the pipeline's run store (specs/07-pipeline-runs.md). Patches are
// merged; whole documents (month record, analysis) are replaced, so a retry that recomputes a
// stage leaves no stale fields behind.
export function firestoreRunStore(db: Firestore = getFirestore(firebaseApp())): RunStore {
  const userPath = firestorePaths.user;
  return {
    async getRun(uid, runId) {
      const snap = await db.doc(firestorePaths.run(uid, runId)).get();
      return snap.exists ? ({ id: snap.id, ...(snap.data() as object) } as RunStatus) : null;
    },
    async updateRun(uid, runId, patch) {
      await db.doc(firestorePaths.run(uid, runId)).set(patch, { merge: true });
    },
    async getUser(uid) {
      const snap = await db.doc(userPath(uid)).get();
      return snap.exists ? (snap.data() as UserRecord) : null;
    },
    async getGoal(uid, goalId) {
      const snap = await db.doc(firestorePaths.goal(uid, goalId)).get();
      return snap.exists ? ({ id: snap.id, ...(snap.data() as object) } as Goal) : null;
    },
    async updateGoal(uid, goalId, patch) {
      await db.doc(firestorePaths.goal(uid, goalId)).set(patch, { merge: true });
    },
    async listRules() {
      const snap = await db.collection("rules").get();
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as RuleValue);
    },
    async listOverrides(uid) {
      const snap = await db.collection(`${userPath(uid)}/overrides`).get();
      return snap.docs.map((d) => ({ ruleId: d.id, ...(d.data() as object) }) as Override);
    },
    async getMonth(uid, month) {
      const snap = await db.doc(firestorePaths.month(uid, month)).get();
      return snap.exists ? (snap.data() as MonthRecord) : null;
    },
    async listMonths(uid) {
      const snap = await db.collection(`${userPath(uid)}/months`).get();
      return snap.docs
        .map((d) => ({ month: d.id, record: d.data() as MonthRecord }))
        .sort((a, b) => a.month.localeCompare(b.month));
    },
    async setMonth(uid, month, record) {
      await db.doc(firestorePaths.month(uid, month)).set(record);
    },
    async getAnalysis(uid, goalId, month) {
      const snap = await db.doc(firestorePaths.analysis(uid, goalId, month)).get();
      return snap.exists ? (snap.data() as Analysis) : null;
    },
    async setAnalysis(uid, goalId, month, analysis) {
      await db.doc(firestorePaths.analysis(uid, goalId, month)).set(analysis);
    },
  };
}
