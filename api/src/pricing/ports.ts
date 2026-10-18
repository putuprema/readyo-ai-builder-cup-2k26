import type { Estimate, Goal, Override, RuleValue } from "@adidi/shared";

// What the estimate endpoint needs from Firestore, as one small interface so the route is
// unit-tested with an in-memory fake. `../infra/firestore.ts` has the firebase-admin version.

export interface GoalStore {
  /** The user's goal, or null when it does not exist (another user's goal is "not found" too). */
  getGoal(uid: string, goalId: string): Promise<Goal | null>;
  /** Replaces the goal's estimate wholesale and bumps updatedAt. */
  setEstimate(uid: string, goalId: string, estimate: Estimate, updatedAt: string): Promise<void>;
  /** The default rule values (`rules` collection). */
  listRules(): Promise<RuleValue[]>;
  /** The user's overrides (`users/{uid}/overrides`). */
  listOverrides(uid: string): Promise<Override[]>;
}
