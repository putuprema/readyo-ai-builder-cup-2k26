import type { Goal, RunKind, RunStage, RunStatus } from "@adidi/shared";
import { plainJson } from "@adidi/shared";
import { ExtractionStageError } from "../extraction/stage.js";
import { STAGE_PERCENT } from "../stages.js";
import { GENERIC_FAILURE_MESSAGE, PipelineError } from "./errors.js";
import type { RunStore, RunTask } from "./ports.js";

// The run loop (specs/07-pipeline-runs.md, task 2): read the run document, hand the run to the
// runner for its kind, write { stage, percent } as each stage is entered, and on success mark
// every goal active with the month. Failures: a PipelineError (or an extraction stop) fails the
// run with its user-readable message and answers 200 so Cloud Tasks does not retry; an
// unexpected error answers 500 for a retry, and on the last attempt the run is failed with a
// generic message. A run already done or failed answers 200 at once.

export interface StageContext {
  uid: string;
  run: RunStatus;
  store: RunStore;
  log: (message: string) => void;
  /** Writes the stage and its percent to the run document (the UI listener sees it). */
  enter(stage: Exclude<RunStage, "done" | "failed">): Promise<void>;
  /** Keeps per-goal agent notes for the run log (never shown to the user). */
  note(goalId: string, notes: NonNullable<RunStatus["goals"]>[string]): void;
}

export type KindRunner = (ctx: StageContext) => Promise<void>;

export interface PipelineDeps {
  store: RunStore;
  runners: Partial<Record<RunKind, KindRunner>>;
  /** Attempts before an unexpected error fails the run (default 3: two retries). */
  maxAttempts?: number;
  now?: () => Date;
  log?: (message: string) => void;
}

export interface PipelineOutcome {
  status: 200 | 500;
  body: { ok: boolean; runId: string; stage?: RunStage; reason?: string };
}

export const DEFAULT_MAX_ATTEMPTS = 3;

export async function runPipeline(
  task: RunTask,
  attempt: number,
  deps: PipelineDeps,
): Promise<PipelineOutcome> {
  const { uid, runId } = task;
  const log = deps.log ?? ((m: string) => console.log(`run ${runId}: ${m}`));
  const now = () => (deps.now ?? (() => new Date()))().toISOString();

  const run = await deps.store.getRun(uid, runId);
  if (!run) {
    log("no run document, ignored");
    return { status: 200, body: { ok: false, runId, reason: "run_not_found" } };
  }
  if (run.stage === "done" || run.stage === "failed") {
    log(`already ${run.stage}, nothing to do`);
    return { status: 200, body: { ok: true, runId, stage: run.stage } };
  }

  const notes: NonNullable<RunStatus["goals"]> = { ...(run.goals ?? {}) };
  const runner = deps.runners[run.kind];
  if (!runner) {
    await fail(`This kind of analysis (${run.kind}) is not available yet.`);
    return { status: 200, body: { ok: false, runId, stage: "failed", reason: "kind_unsupported" } };
  }

  const attemptNumber = attempt + 1;
  await deps.store.updateRun(uid, runId, { attempt: attemptNumber, updatedAt: now() });
  log(
    `${run.kind} run for ${run.month}, attempt ${attemptNumber}, goals ${run.goalIds.join(", ")}`,
  );

  const ctx: StageContext = {
    uid,
    run,
    store: deps.store,
    log,
    async enter(stage) {
      log(`stage ${stage}`);
      await deps.store.updateRun(uid, runId, {
        stage,
        percent: STAGE_PERCENT[stage],
        updatedAt: now(),
      });
    },
    note(goalId, goalNotes) {
      notes[goalId] = plainJson(goalNotes);
    },
  };

  try {
    await runner(ctx);
  } catch (error) {
    if (error instanceof PipelineError || error instanceof ExtractionStageError) {
      log(`failed: ${error.message}`);
      await fail(error.message);
      return { status: 200, body: { ok: false, runId, stage: "failed", reason: error.message } };
    }
    const description = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    if (attemptNumber >= maxAttempts) {
      log(`unexpected error on the last attempt (${attemptNumber}/${maxAttempts}): ${description}`);
      console.error(`run ${runId}: giving up`, error);
      await fail(GENERIC_FAILURE_MESSAGE);
      return { status: 200, body: { ok: false, runId, stage: "failed", reason: "gave_up" } };
    }
    log(
      `unexpected error (attempt ${attemptNumber}/${maxAttempts}), asking for a retry: ${description}`,
    );
    console.error(`run ${runId}: attempt ${attemptNumber} failed`, error);
    return { status: 500, body: { ok: false, runId, stage: run.stage, reason: "retry" } };
  }

  const finishedAt = now();
  for (const goalId of run.goalIds) {
    const patch: Partial<Goal> = {
      status: "active",
      latestAnalysisMonth: run.month,
      updatedAt: finishedAt,
    };
    await deps.store.updateGoal(uid, goalId, patch);
  }
  await deps.store.updateRun(uid, runId, {
    stage: "done",
    percent: STAGE_PERCENT.done,
    updatedAt: finishedAt,
    finishedAt,
    ...(Object.keys(notes).length > 0 ? { goals: notes } : {}),
  });
  log("done");
  return { status: 200, body: { ok: true, runId, stage: "done" } };

  async function fail(message: string): Promise<void> {
    const finishedAt = now();
    for (const goalId of run?.goalIds ?? []) {
      const before = run?.goalStatusBefore?.[goalId] ?? "draft";
      const patch: Partial<Goal> = { status: before, updatedAt: finishedAt };
      if (before === "draft") patch.draftStep = "documents";
      await deps.store.updateGoal(uid, goalId, patch);
    }
    await deps.store.updateRun(uid, runId, {
      stage: "failed",
      error: message,
      updatedAt: finishedAt,
      finishedAt,
      ...(Object.keys(notes).length > 0 ? { goals: notes } : {}),
    });
  }
}
