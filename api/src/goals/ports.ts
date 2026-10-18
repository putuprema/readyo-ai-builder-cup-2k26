import type { Goal } from "@adidi/shared";
import type { GoalStore } from "../pricing/ports.js";

// What POST /goals, PATCH /goals/:id and DELETE /goals/:id need from Firestore, as one small
// interface so the handlers are unit-tested with `./fakes.ts`. Extends the estimate endpoint's
// store because a typed price without an AI estimate is stored as an estimate too (and needs
// the growth rule). `../infra/firestore.ts` has the firebase-admin version.

export interface GoalWriteStore extends GoalStore {
  /** Writes a new goal document (the id is on the goal). */
  createGoal(uid: string, goal: Goal): Promise<void>;
  /** Replaces the goal document wholesale. */
  replaceGoal(uid: string, goal: Goal): Promise<void>;
  /** Deletes the goal and everything under it (its analyses). */
  deleteGoal(uid: string, goalId: string): Promise<void>;
}
