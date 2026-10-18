import type {
  Analysis,
  DismissedAction,
  Goal,
  MonthRecord,
  Override,
  RuleValue,
  UserRecord,
} from "@adidi/shared";
import defaultRules from "@adidi/shared/rules/defaults.json" with { type: "json" };
import type { AnalysisStore } from "./ports.js";

/** In-memory analysis store for the choices tests (keys carry the uid). */
export class FakeAnalysisStore implements AnalysisStore {
  readonly goals = new Map<string, Goal>(); // `${uid}/${goalId}`
  readonly analyses = new Map<string, Analysis>(); // `${uid}/${goalId}/${month}`
  readonly users = new Map<string, UserRecord>();
  readonly months = new Map<string, MonthRecord>(); // `${uid}/${month}`
  readonly dismissedWrites: DismissedAction[][] = [];
  rules: RuleValue[] = defaultRules as RuleValue[];
  overrides: Override[] = [];

  async getGoal(uid: string, goalId: string) {
    return this.goals.get(`${uid}/${goalId}`) ?? null;
  }

  async getAnalysis(uid: string, goalId: string, month: string) {
    return this.analyses.get(`${uid}/${goalId}/${month}`) ?? null;
  }

  async updateAnalysis(
    uid: string,
    goalId: string,
    month: string,
    patch: Pick<Analysis, "choices" | "withChoices">,
  ) {
    const key = `${uid}/${goalId}/${month}`;
    const current = this.analyses.get(key);
    if (!current) throw new Error(`no analysis ${key}`);
    this.analyses.set(key, { ...current, ...patch });
  }

  async getUser(uid: string) {
    return this.users.get(uid) ?? null;
  }

  async getMonth(uid: string, month: string) {
    return this.months.get(`${uid}/${month}`) ?? null;
  }

  async listRules() {
    return this.rules;
  }

  async listOverrides() {
    return this.overrides;
  }

  async setDismissedActions(uid: string, dismissed: DismissedAction[]) {
    const user = this.users.get(uid);
    if (!user) throw new Error(`no user ${uid}`);
    this.users.set(uid, {
      ...user,
      preferences: { ...user.preferences, dismissedActions: dismissed },
    });
    this.dismissedWrites.push(dismissed);
  }
}
