import { type Analysis, type MonthRecord, plainJson, type RunKind } from "@adidi/shared";
import { computeDelta, writeDeltaSummary } from "./delta.js";
import { PipelineError } from "./errors.js";
import type { KindRunner, StageContext } from "./runner.js";
import {
  analyseGoals,
  buildMonth,
  loadGoal,
  loadUserContext,
  readAndClean,
  type StepDeps,
} from "./steps.js";

// One runner per kind of run (specs/07-pipeline-runs.md, "Behavior" table), built from the
// steps in steps.ts. The runner writes `done` and the goals' statuses itself.

export function createRunners(deps: StepDeps): Partial<Record<RunKind, KindRunner>> {
  return {
    first: firstRunner(deps),
    reuse: reuseRunner(deps),
    recalculate: recalculateRunner(deps),
    monthly: monthlyRunner(deps),
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

/** monthly: as `first` for the new month over every active goal, then stage 7 (the delta). */
export function monthlyRunner(deps: StepDeps): KindRunner {
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
    const analyses = await analyseGoals(ctx, deps, { snapshot, user, goalIds: ctx.run.goalIds });

    // Stage 7, still under "planning" for the UI: what moved since the goal's previous analysis.
    for (const goalId of ctx.run.goalIds) {
      const analysis = analyses[goalId];
      if (!analysis || analysis.delta) continue;
      const goal = await loadGoal(ctx, goalId);
      const previousMonth = await previousAnalysisMonth(ctx, goal.latestAnalysisMonth);
      if (!previousMonth) {
        ctx.log(`goal ${goalId}: no earlier analysis, no delta`);
        continue;
      }
      const [previousRecord, previousAnalysis] = await Promise.all([
        ctx.store.getMonth(ctx.uid, previousMonth),
        ctx.store.getAnalysis(ctx.uid, goalId, previousMonth),
      ]);
      if (!previousRecord || !previousAnalysis) {
        ctx.log(`goal ${goalId}: ${previousMonth} has no stored snapshot or analysis, no delta`);
        continue;
      }
      const facts = computeDelta({
        goal,
        previous: {
          month: previousMonth,
          snapshot: previousRecord.snapshot,
          analysis: previousAnalysis,
        },
        current: { snapshot, analysis },
      });
      const written = await writeDeltaSummary(facts, deps.model, {
        log: (m) => ctx.log(`goal ${goalId}: ${m}`),
      });
      for (const w of written.warnings) ctx.log(`goal ${goalId}: ${w}`);
      const withDelta: Analysis = plainJson({
        ...analysis,
        delta: { ...facts.delta, summary: written.summary },
      });
      await ctx.store.setAnalysis(ctx.uid, goalId, ctx.run.month, withDelta);
      ctx.log(
        `goal ${goalId}: delta vs ${previousMonth}: ${facts.delta.metricsChanged.length} metric(s) moved, ${facts.delta.committedActions.filter((a) => a.kept).length}/${facts.delta.committedActions.length} committed action(s) kept`,
      );
    }
  };
}

/** The month of the goal's previous analysis: its latestAnalysisMonth before this run, when
 *  it is earlier than the run's month (the runner sets the new one only on success). */
async function previousAnalysisMonth(
  ctx: StageContext,
  latestAnalysisMonth: string | undefined,
): Promise<string | null> {
  if (latestAnalysisMonth && latestAnalysisMonth < ctx.run.month) return latestAnalysisMonth;
  const earlier = (await ctx.store.listMonths(ctx.uid)).filter((m) => m.month < ctx.run.month);
  return earlier[earlier.length - 1]?.month ?? null;
}
