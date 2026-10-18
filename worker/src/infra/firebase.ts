import { firestorePaths } from "@adidi/shared";
import { type App, getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { ExtractedRecords, RecordsPort, StoragePort } from "../extraction/ports.js";

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

export function cloudStorage(bucketName = process.env.STORAGE_BUCKET): StoragePort {
  const bucket = getStorage(firebaseApp()).bucket(bucketName);
  return {
    async download(path) {
      const file = bucket.file(path);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [metadata] = await file.getMetadata();
      const [bytes] = await file.download();
      return { bytes: new Uint8Array(bytes), contentType: metadata.contentType };
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
  };
}
