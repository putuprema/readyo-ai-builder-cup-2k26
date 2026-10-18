import {
  type DocumentRecord,
  firestorePaths,
  type Goal,
  type Override,
  type RuleValue,
} from "@adidi/shared";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { firebaseApp } from "../firebase.js";
import type { GoalStore } from "../pricing/ports.js";
import type { RunStore } from "../runs/ports.js";

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
