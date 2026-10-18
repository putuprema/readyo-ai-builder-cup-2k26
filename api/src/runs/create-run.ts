import {
  type GoalStatus,
  plainJson,
  type RunKind,
  type RunStatus,
  reusableMonth,
} from "@adidi/shared";
import type { CreateRunBody } from "../schemas.js";
import type { RunStore, TaskQueue } from "./ports.js";

// POST /runs (specs/07-pipeline-runs.md): check the goals and documents, write the run document
// with the goals set to `analysing`, enqueue one Cloud Task, answer with the runId. The worker
// reads everything it needs from the run document, so the task body is `{ uid, runId }`.

export interface CreateRunDeps {
  store: RunStore;
  queue: TaskQueue;
  now?: () => Date;
  newRunId?: () => string;
}

export type CreateRunOutcome =
  | { status: 202; body: { runId: string } }
  | { status: 404 | 409 | 503; body: { error: string; message: string } };

/** Which goal statuses each kind of run accepts (docs/analysis.md, "Triggers"). */
const ALLOWED_STATUS: Record<RunKind, GoalStatus[]> = {
  first: ["draft"],
  reuse: ["draft"],
  monthly: ["active"],
  recalculate: ["active"],
};

export async function createRun(
  uid: string,
  body: CreateRunBody,
  deps: CreateRunDeps,
): Promise<CreateRunOutcome> {
  const now = (deps.now ?? (() => new Date()))();

  const goalStatusBefore: Record<string, GoalStatus> = {};
  for (const goalId of body.goalIds) {
    const goal = await deps.store.getGoal(uid, goalId);
    if (!goal) return notFound(`Goal ${goalId} not found`);
    if (goal.status === "analysing") {
      return conflict("goal_analysing", "This goal is already being analysed");
    }
    if (!ALLOWED_STATUS[body.kind].includes(goal.status)) {
      return conflict(
        "goal_status",
        `A ${body.kind} run needs ${ALLOWED_STATUS[body.kind].join(" or ")} goals; ${goalId} is ${goal.status}`,
      );
    }
    if (!goal.estimate) {
      return conflict("goal_not_priced", "Calculate the goal's estimate before submitting");
    }
    goalStatusBefore[goalId] = goal.status;
  }

  if (body.kind === "reuse") {
    const months = await deps.store.listMonths(uid);
    if (!months.includes(body.month)) {
      return conflict("month_missing", `No statements were submitted for ${body.month}`);
    }
    if (reusableMonth([body.month], now) !== body.month) {
      return conflict(
        "month_too_old",
        `The statements for ${body.month} are more than 45 days old; upload the latest month instead`,
      );
    }
  }

  const documentIds = body.documentIds ?? [];
  for (const documentId of documentIds) {
    const doc = await deps.store.getDocument(uid, documentId);
    if (!doc || doc.status === "deleted") return notFound(`Document ${documentId} not found`);
  }

  const runId = (deps.newRunId ?? defaultRunId)();
  const startedAt = now.toISOString();
  const run: RunStatus = {
    id: runId,
    stage: "reading",
    percent: 0,
    startedAt,
    updatedAt: startedAt,
    goalIds: body.goalIds,
    month: body.month,
    kind: body.kind,
    goalStatusBefore,
    attempt: 0,
    ...(documentIds.length > 0 ? { documentIds } : {}),
  };
  const analysing = Object.fromEntries(body.goalIds.map((id) => [id, "analysing" as const]));
  await deps.store.createRun(uid, plainJson(run), analysing);

  try {
    await deps.queue.enqueue({ uid, runId });
  } catch (error) {
    console.error(`run ${runId}: enqueue failed`, error);
    await deps.store.failRun(
      uid,
      runId,
      "We could not start the analysis. Please try again in a moment.",
      goalStatusBefore,
    );
    return {
      status: 503,
      body: { error: "queue_unavailable", message: "The analysis could not be started" },
    };
  }
  return { status: 202, body: { runId } };
}

function defaultRunId(): string {
  return `run_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function notFound(message: string): CreateRunOutcome {
  return { status: 404, body: { error: "not_found", message } };
}

function conflict(error: string, message: string): CreateRunOutcome {
  return { status: 409, body: { error, message } };
}
