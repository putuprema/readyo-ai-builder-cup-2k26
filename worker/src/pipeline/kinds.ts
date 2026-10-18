import type { RunKind } from "@adidi/shared";
import type { KindRunner } from "./runner.js";
import { analyseGoals, buildMonth, loadUserContext, readAndClean, type StepDeps } from "./steps.js";

// One runner per kind of run (specs/07-pipeline-runs.md, "Behavior" table), built from the
// steps in steps.ts. The runner writes `done` and the goals' statuses itself.

export function createRunners(deps: StepDeps): Partial<Record<RunKind, KindRunner>> {
  return {
    first: firstRunner(deps),
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
