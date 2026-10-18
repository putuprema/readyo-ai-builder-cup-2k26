import type { DocumentRecord, Goal, GoalStatus, RunStatus } from "@adidi/shared";
import type { RunStore, RunTask, TaskQueue } from "./ports.js";

// In-memory versions of the run store and the task queue for the POST /runs tests.

export class FakeRunStore implements RunStore {
  readonly goals = new Map<string, Goal>(); // key: `${uid}/${goalId}`
  readonly documents = new Map<string, DocumentRecord>(); // key: `${uid}/${documentId}`
  readonly months = new Map<string, string[]>(); // uid -> month keys
  readonly runs = new Map<string, RunStatus>(); // key: `${uid}/${runId}`

  addGoal(uid: string, goal: Goal): this {
    this.goals.set(`${uid}/${goal.id}`, goal);
    return this;
  }

  addDocument(uid: string, doc: DocumentRecord): this {
    this.documents.set(`${uid}/${doc.id}`, doc);
    return this;
  }

  addMonth(uid: string, month: string): this {
    this.months.set(uid, [...(this.months.get(uid) ?? []), month]);
    return this;
  }

  async getGoal(uid: string, goalId: string): Promise<Goal | null> {
    return this.goals.get(`${uid}/${goalId}`) ?? null;
  }

  async getDocument(uid: string, documentId: string): Promise<DocumentRecord | null> {
    return this.documents.get(`${uid}/${documentId}`) ?? null;
  }

  async listMonths(uid: string): Promise<string[]> {
    return this.months.get(uid) ?? [];
  }

  async createRun(uid: string, run: RunStatus, goalStatuses: Record<string, GoalStatus>) {
    this.runs.set(`${uid}/${run.id}`, run);
    this.setStatuses(uid, goalStatuses);
  }

  async failRun(
    uid: string,
    runId: string,
    error: string,
    goalStatuses: Record<string, GoalStatus>,
  ) {
    const run = this.runs.get(`${uid}/${runId}`);
    if (run) this.runs.set(`${uid}/${runId}`, { ...run, stage: "failed", error });
    this.setStatuses(uid, goalStatuses);
  }

  private setStatuses(uid: string, statuses: Record<string, GoalStatus>) {
    for (const [goalId, status] of Object.entries(statuses)) {
      const goal = this.goals.get(`${uid}/${goalId}`);
      if (goal) this.goals.set(`${uid}/${goalId}`, { ...goal, status });
    }
  }
}

export class FakeTaskQueue implements TaskQueue {
  readonly tasks: RunTask[] = [];

  constructor(private readonly failWith?: Error) {}

  async enqueue(task: RunTask): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.tasks.push(task);
  }
}
