import type { DocumentRecord, Goal, GoalStatus, RunStatus } from "@adidi/shared";

// What POST /runs needs from Firestore and from the task queue, as two small interfaces so the
// route is unit-tested with in-memory fakes (`./fakes.ts`). `../infra/firestore.ts` and
// `../infra/tasks.ts` have the firebase-admin and Cloud Tasks versions.

export interface RunStore {
  /** The user's goal, or null when it does not exist (another user's goal is "not found" too). */
  getGoal(uid: string, goalId: string): Promise<Goal | null>;
  /** The user's upload record, or null. */
  getDocument(uid: string, documentId: string): Promise<DocumentRecord | null>;
  /** Month keys of the user's submitted months (`users/{uid}/months`). */
  listMonths(uid: string): Promise<string[]>;
  /** Writes the run document and the goals' new statuses together. */
  createRun(uid: string, run: RunStatus, goalStatuses: Record<string, GoalStatus>): Promise<void>;
  /** Marks the run failed and restores the goals' statuses (enqueue failed). */
  failRun(
    uid: string,
    runId: string,
    error: string,
    goalStatuses: Record<string, GoalStatus>,
  ): Promise<void>;
}

/** The body of the Cloud Task that starts a run; the worker reads the rest from the run document. */
export interface RunTask {
  uid: string;
  runId: string;
}

export interface TaskQueue {
  /** Enqueues the task; enqueueing the same runId twice is not an error. */
  enqueue(task: RunTask): Promise<void>;
}
