import {
  type Analysis,
  type DocumentRecord,
  firestorePaths,
  type Goal,
  type MonthRecord,
  type Override,
  type RuleValue,
  type UserRecord,
} from "@adidi/shared";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import type { UserDataStore } from "../account/ports.js";
import type { AnalysisStore } from "../choices/ports.js";
import { firebaseApp } from "../firebase.js";
import type { GoalWriteStore } from "../goals/ports.js";
import type { GoalStore } from "../pricing/ports.js";
import type { RunStore } from "../runs/ports.js";
import type { UploadStore } from "../uploads/ports.js";

// Cloud Run adapter for the goal store (specs/01-contracts.md, "Firestore layout"). Uses the
// same firebase-admin app as token verification; FIRESTORE_EMULATOR_HOST points it at the
// emulator locally.

export function firestoreGoals(db: Firestore = getFirestore(firebaseApp())): GoalStore {
  return {
    async getGoal(uid, goalId) {
      const snap = await db.doc(firestorePaths.goal(uid, goalId)).get();
      if (!snap.exists) return null;
      return { id: snap.id, ...(snap.data() as object) } as Goal;
    },
    async setEstimate(uid, goalId, estimate, updatedAt) {
      // update() replaces the `estimate` field wholesale (a merge would keep stale sub-fields
      // such as a userOverride) and fails when the goal is gone.
      await db.doc(firestorePaths.goal(uid, goalId)).update({ estimate, updatedAt });
    },
    async listRules() {
      const snap = await db.collection("rules").get();
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as RuleValue);
    },
    async listOverrides(uid) {
      const snap = await db.collection(`${firestorePaths.user(uid)}/overrides`).get();
      return snap.docs.map((d) => ({ ruleId: d.id, ...(d.data() as object) }) as Override);
    },
  };
}

// Goal writes for POST /goals, PATCH /goals/:id and DELETE /goals/:id (spec 10).
export function firestoreGoalWrites(db: Firestore = getFirestore(firebaseApp())): GoalWriteStore {
  const reads = firestoreGoals(db);
  return {
    ...reads,
    async createGoal(uid, goal) {
      await db.doc(firestorePaths.goal(uid, goal.id)).create(goal);
    },
    async replaceGoal(uid, goal) {
      await db.doc(firestorePaths.goal(uid, goal.id)).set(goal);
    },
    async deleteGoal(uid, goalId) {
      // Removes the analyses subcollection with the document.
      await db.recursiveDelete(db.doc(firestorePaths.goal(uid, goalId)));
    },
  };
}

// Upload records for POST /uploads and DELETE /uploads/:docId (spec 10).
export function firestoreUploads(db: Firestore = getFirestore(firebaseApp())): UploadStore {
  return {
    async createDocument(uid, doc) {
      await db.doc(firestorePaths.document(uid, doc.id)).create(doc);
    },
    async getDocument(uid, documentId) {
      const snap = await db.doc(firestorePaths.document(uid, documentId)).get();
      if (!snap.exists) return null;
      return { id: snap.id, ...(snap.data() as object) } as DocumentRecord;
    },
    async updateDocument(uid, documentId, patch) {
      await db.doc(firestorePaths.document(uid, documentId)).update({ ...patch });
    },
  };
}

// Run store for POST /runs (specs/07-pipeline-runs.md). The run document and the goals' new
// statuses go in one batch so the UI never sees a goal `analysing` without its run.
export function firestoreRuns(db: Firestore = getFirestore(firebaseApp())): RunStore {
  return {
    async getGoal(uid, goalId) {
      const snap = await db.doc(firestorePaths.goal(uid, goalId)).get();
      if (!snap.exists) return null;
      return { id: snap.id, ...(snap.data() as object) } as Goal;
    },
    async getDocument(uid, documentId) {
      const snap = await db.doc(firestorePaths.document(uid, documentId)).get();
      if (!snap.exists) return null;
      return { id: snap.id, ...(snap.data() as object) } as DocumentRecord;
    },
    async listMonths(uid) {
      const snap = await db.collection(`${firestorePaths.user(uid)}/months`).get();
      return snap.docs.map((d) => d.id);
    },
    async createRun(uid, run, goalStatuses) {
      const batch = db.batch();
      batch.set(db.doc(firestorePaths.run(uid, run.id)), run);
      for (const [goalId, status] of Object.entries(goalStatuses)) {
        batch.update(db.doc(firestorePaths.goal(uid, goalId)), {
          status,
          updatedAt: run.updatedAt ?? run.startedAt,
        });
      }
      await batch.commit();
    },
    async failRun(uid, runId, error, goalStatuses) {
      const now = new Date().toISOString();
      const batch = db.batch();
      batch.set(
        db.doc(firestorePaths.run(uid, runId)),
        { stage: "failed", error, updatedAt: now, finishedAt: now },
        { merge: true },
      );
      for (const [goalId, status] of Object.entries(goalStatuses)) {
        batch.update(db.doc(firestorePaths.goal(uid, goalId)), { status, updatedAt: now });
      }
      await batch.commit();
    },
  };
}

// Analysis store for the choices endpoint (specs/06-agent.md, "Choices").
export function firestoreAnalyses(db: Firestore = getFirestore(firebaseApp())): AnalysisStore {
  const goals = firestoreGoals(db);
  return {
    getGoal: goals.getGoal,
    listRules: goals.listRules,
    listOverrides: goals.listOverrides,
    async getAnalysis(uid, goalId, month) {
      const snap = await db.doc(firestorePaths.analysis(uid, goalId, month)).get();
      return snap.exists ? (snap.data() as Analysis) : null;
    },
    async updateAnalysis(uid, goalId, month, patch) {
      await db.doc(firestorePaths.analysis(uid, goalId, month)).update({ ...patch });
    },
    async getUser(uid) {
      const snap = await db.doc(firestorePaths.user(uid)).get();
      return snap.exists ? (snap.data() as UserRecord) : null;
    },
    async getMonth(uid, month) {
      const snap = await db.doc(firestorePaths.month(uid, month)).get();
      return snap.exists ? (snap.data() as MonthRecord) : null;
    },
    async setDismissedActions(uid, dismissed) {
      await db
        .doc(firestorePaths.user(uid))
        .set({ preferences: { dismissedActions: dismissed } }, { merge: true });
    },
  };
}

// Everything under users/{uid} for DELETE /me/data. The counts come from aggregate queries
// before the delete; recursiveDelete removes the profile document with every subcollection,
// including collections added after this was written.
export function firestoreUserData(db: Firestore = getFirestore(firebaseApp())): UserDataStore {
  const user = (uid: string) => db.doc(firestorePaths.user(uid));
  const count = async (path: string) => (await db.collection(path).count().get()).data().count;
  return {
    async listRuns(uid) {
      const snap = await user(uid)
        .collection("runs")
        .select("stage", "updatedAt", "startedAt")
        .get();
      return snap.docs.map((d) => ({
        stage: d.get("stage"),
        updatedAt: d.get("updatedAt") ?? d.get("startedAt") ?? "",
      }));
    },
    async countUserData(uid) {
      const base = firestorePaths.user(uid);
      const [profile, goals] = await Promise.all([
        user(uid).get(),
        user(uid).collection("goals").select().get(),
      ]);
      const [analyses, months, transactions, loans, holdings, documents, runs, overrides] =
        await Promise.all([
          Promise.all(goals.docs.map((g) => count(`${g.ref.path}/analyses`))).then((ns) =>
            ns.reduce((a, b) => a + b, 0),
          ),
          count(`${base}/months`),
          count(`${base}/transactions`),
          count(`${base}/loans`),
          count(`${base}/holdings`),
          count(`${base}/documents`),
          count(`${base}/runs`),
          count(`${base}/overrides`),
        ]);
      return {
        profile: profile.exists ? 1 : 0,
        goals: goals.size,
        analyses,
        months,
        transactions,
        loans,
        holdings,
        documents,
        runs,
        overrides,
      };
    },
    async deleteUserData(uid) {
      await db.recursiveDelete(user(uid));
    },
  };
}
