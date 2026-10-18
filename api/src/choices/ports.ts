import type {
  Analysis,
  DismissedAction,
  Goal,
  MonthRecord,
  Override,
  RuleValue,
  UserRecord,
} from "@adidi/shared";

// What PATCH /goals/:id/analyses/:month/choices needs from Firestore, as one small interface so
// the route is unit-tested with `./fakes.ts`. `../infra/firestore.ts` has the firebase-admin version.

export interface AnalysisStore {
  getGoal(uid: string, goalId: string): Promise<Goal | null>;
  getAnalysis(uid: string, goalId: string, month: string): Promise<Analysis | null>;
  /** Merges the patch into the analysis document (choices and the plan after the choices). */
  updateAnalysis(
    uid: string,
    goalId: string,
    month: string,
    patch: Pick<Analysis, "choices" | "withChoices">,
  ): Promise<void>;
  getUser(uid: string): Promise<UserRecord | null>;
  getMonth(uid: string, month: string): Promise<MonthRecord | null>;
  listRules(): Promise<RuleValue[]>;
  listOverrides(uid: string): Promise<Override[]>;
  /** Replaces `preferences.dismissedActions` on users/{uid}. */
  setDismissedActions(uid: string, dismissed: DismissedAction[]): Promise<void>;
}
