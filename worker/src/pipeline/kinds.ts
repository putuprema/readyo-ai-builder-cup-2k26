import type { Analysis, MonthRecord, RunKind } from "@adidi/shared";
import { PipelineError } from "./errors.js";
import type { KindRunner, StageContext } from "./runner.js";
import { analyseGoals, buildMonth, loadUserContext, readAndClean, type StepDeps } from "./steps.js";

// One runner per kind of run (specs/07-pipeline-runs.md, "Behavior" table), built from the
// steps in steps.ts. The runner writes `done` and the goals' statuses itself.

export function createRunners(deps: StepDeps): Partial<Record<RunKind, KindRunner>> {
  return {
    first: firstRunner(deps),
    reuse: reuseRunner(deps),
    recalculate: recalculateRunner(deps),
  };
}

/** first: extraction → normalization → snapshot → simulate → agent. */
export function firstRunner(deps: StepDeps): KindRunner {
  return async (ctx) => {
    const user = await loadUserContext(ctx);
    const existing = await ctx.store.getMonth(ctx.uid, ctx.run.month);
    let snapshot = existing?.snapshot;
    if (existing?.runId === ctx.run.id && snapshot) {
      ctx.log(`month ${ctx.run.month} already written by this run, documents not read again`);
    } else {
      const read = await readAndClean(ctx, deps, ctx.run.documentIds ?? []);
      snapshot = (await buildMonth(ctx, deps, read, user)).snapshot;
    }
    await analyseGoals(ctx, deps, { snapshot, user, goalIds: ctx.run.goalIds });
  };
}

/** reuse: the stored month's snapshot → simulate → agent for the new goal. Never extracts. */
export function reuseRunner(deps: StepDeps): KindRunner {
  return async (ctx) => {
    const user = await loadUserContext(ctx);
    const month = await requireMonth(ctx);
    await analyseGoals(ctx, deps, { snapshot: month.snapshot, user, goalIds: ctx.run.goalIds });
  };
}

/** recalculate: simulate → agent again for every active goal on the month's stored snapshot,
 *  with the user's current overrides; choices carry over to matching actions. */
export function recalculateRunner(deps: StepDeps): KindRunner {
  return async (ctx) => {
    const user = await loadUserContext(ctx);
    const month = await requireMonth(ctx);
    const previousChoices: Record<string, Pick<Analysis, "actions" | "choices">> = {};
    for (const goalId of ctx.run.goalIds) {
      const previous = await ctx.store.getAnalysis(ctx.uid, goalId, ctx.run.month);
      if (previous && previous.runId !== ctx.run.id) {
        previousChoices[goalId] = { actions: previous.actions, choices: previous.choices };
      }
    }
    await analyseGoals(ctx, deps, {
      snapshot: month.snapshot,
      user,
      goalIds: ctx.run.goalIds,
      previousChoices,
    });
  };
}

async function requireMonth(ctx: StageContext): Promise<MonthRecord> {
  const month = await ctx.store.getMonth(ctx.uid, ctx.run.month);
  if (!month) {
    throw new PipelineError(
      `No statements are stored for ${ctx.run.month}. Upload that month's statements first.`,
    );
  }
  return month;
}
