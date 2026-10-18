import type {
  Analysis,
  Goal,
  MonthRecord,
  Override,
  RuleValue,
  RunStatus,
  Transaction,
  UserRecord,
} from "@adidi/shared";
import type { RunStore } from "./ports.js";

// In-memory run store for the pipeline tests. Single user: the uid is checked but not used as
// a key, which keeps the test setup short.

export class FakeRunStore implements RunStore {
  readonly runs = new Map<string, RunStatus>();
  readonly users = new Map<string, UserRecord>();
  readonly goals = new Map<string, Goal>();
  readonly months = new Map<string, MonthRecord>();
  readonly analyses = new Map<string, Analysis>(); // key: `${goalId}/${month}`
  readonly transactions = new Map<string, Transaction>();
  rules: RuleValue[] = [];
  overrides: Override[] = [];
  /** Every run patch in order, so tests check the stage sequence the UI listener would see. */
  readonly runPatches: Partial<RunStatus>[] = [];

  async getRun(_uid: string, runId: string) {
    return this.runs.get(runId) ?? null;
  }

  async updateRun(_uid: string, runId: string, patch: Partial<RunStatus>) {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`no run ${runId}`);
    this.runs.set(runId, { ...run, ...patch });
    this.runPatches.push(patch);
  }

  async getUser(uid: string) {
    return this.users.get(uid) ?? null;
  }

  async getGoal(_uid: string, goalId: string) {
    return this.goals.get(goalId) ?? null;
  }

  async updateGoal(_uid: string, goalId: string, patch: Partial<Goal>) {
    const goal = this.goals.get(goalId);
    if (!goal) throw new Error(`no goal ${goalId}`);
    this.goals.set(goalId, { ...goal, ...patch });
  }

  async listRules() {
    return this.rules;
  }

  async listOverrides() {
    return this.overrides;
  }

  async getMonth(_uid: string, month: string) {
    return this.months.get(month) ?? null;
  }

  async listMonths() {
    return [...this.months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, record]) => ({ month, record }));
  }

  async setMonth(_uid: string, month: string, record: MonthRecord) {
    this.months.set(month, record);
  }

  async getAnalysis(_uid: string, goalId: string, month: string) {
    return this.analyses.get(`${goalId}/${month}`) ?? null;
  }

  async setAnalysis(_uid: string, goalId: string, month: string, analysis: Analysis) {
    this.analyses.set(`${goalId}/${month}`, analysis);
  }

  async listTransactionsBefore(_uid: string, month: string) {
    return [...this.transactions.values()].filter((t) => t.month < month);
  }

  async writeTransactions(_uid: string, transactions: Transaction[]) {
    for (const t of transactions) this.transactions.set(t.id, t);
  }

  async deleteTransactions(_uid: string, ids: string[]) {
    for (const id of ids) this.transactions.delete(id);
  }

  /** The stages written to the run document, in order. */
  stagesSeen(): string[] {
    return this.runPatches.flatMap((p) => (p.stage ? [p.stage] : []));
  }
}
