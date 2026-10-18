import { firestorePaths, type Goal, type Override, type RuleValue } from "@adidi/shared";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { firebaseApp } from "../firebase.js";
import type { GoalStore } from "../pricing/ports.js";

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
