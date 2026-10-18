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

// What the pipeline needs from Firestore besides the extraction ports, as one interface so the
// runner and the stages are unit-tested with `./fakes.ts`. `../infra/firebase.ts` has the
// firebase-admin version. Every write of a result goes through plainJson() in the stages, so the
// store never sees `undefined`.

export interface RunStore {
  getRun(uid: string, runId: string): Promise<RunStatus | null>;
  updateRun(uid: string, runId: string, patch: Partial<RunStatus>): Promise<void>;

  getUser(uid: string): Promise<UserRecord | null>;
  getGoal(uid: string, goalId: string): Promise<Goal | null>;
  updateGoal(uid: string, goalId: string, patch: Partial<Goal>): Promise<void>;

  listRules(): Promise<RuleValue[]>;
  listOverrides(uid: string): Promise<Override[]>;

  getMonth(uid: string, month: string): Promise<MonthRecord | null>;
  /** Every submitted month, oldest first. */
  listMonths(uid: string): Promise<{ month: string; record: MonthRecord }[]>;
  setMonth(uid: string, month: string, record: MonthRecord): Promise<void>;

  getAnalysis(uid: string, goalId: string, month: string): Promise<Analysis | null>;
  setAnalysis(uid: string, goalId: string, month: string, analysis: Analysis): Promise<void>;

  /** Stored transactions of the months before `month` (recurring detection). */
  listTransactionsBefore(uid: string, month: string): Promise<Transaction[]>;
  /** Overwrites the given transactions by id (normalized rows replace the extracted ones). */
  writeTransactions(uid: string, transactions: Transaction[]): Promise<void>;
  deleteTransactions(uid: string, ids: string[]): Promise<void>;
}

/** The body Cloud Tasks posts to the worker (api/src/runs/ports.ts has the same shape). */
export interface RunTask {
  uid: string;
  runId: string;
}
