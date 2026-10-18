import {
  type ActionChoice,
  type Analysis,
  buildSnapshot,
  computeMetrics,
  type DismissedAction,
  type Goal,
  type Holding,
  type Loan,
  type MonthRecord,
  mergeRules,
  type Profile,
  plainJson,
  type Rules,
  type Snapshot,
  type SourceKind,
  simulate,
  type Transaction,
} from "@adidi/shared";
import { runAgent } from "../agent/index.js";
import type { RecordsPort, StoragePort } from "../extraction/ports.js";
import {
  type ExtractedSource,
  type FailedSource,
  runExtractionStage,
} from "../extraction/stage.js";
import type { JsonModel, ToolModel } from "../gemini/client.js";
import { normalize } from "../normalization/index.js";
import { PipelineError } from "./errors.js";
import type { StageContext } from "./runner.js";

// The steps every kind of run is made of (specs/07-pipeline-runs.md): read and clean the
// documents (stages 2–3), build the month's snapshot (stage 4), then simulate, measure and plan
// for each goal (stages 5–6). `first` uses all of them; `reuse` and `recalculate` start at the
// stored snapshot; `monthly` adds the delta (delta.ts). Each step checks for its own output
// from this run before redoing work, so a Cloud Tasks retry never duplicates anything.

export interface StepDeps {
  storage: StoragePort;
  records: RecordsPort;
  model: JsonModel & ToolModel;
  now?: () => Date;
}

export interface UserContext {
  profile: Profile;
  dismissed: DismissedAction[];
  rules: Rules;
}

/** The profile, the dismissed actions and the merged rules; fails the run without a profile. */
export async function loadUserContext(ctx: StageContext): Promise<UserContext> {
  const user = await ctx.store.getUser(ctx.uid);
  if (!user) {
    throw new PipelineError("Complete your profile (age, income, employment) before submitting.");
  }
  const { preferences, ...profile } = user;
  const [rules, overrides] = await Promise.all([
    ctx.store.listRules(),
    ctx.store.listOverrides(ctx.uid),
  ]);
  return {
    profile,
    dismissed: preferences?.dismissedActions ?? [],
    rules: mergeRules(rules, overrides),
  };
}

export interface ReadResult {
  extracted: ExtractedSource[];
  failed: FailedSource[];
  transactions: Transaction[];
  loans: Loan[];
  holdings: Holding[];
}

/** Stages 2 and 3: extraction (the "reading" stage) and normalization ("cleaning"). */
export async function readAndClean(
  ctx: StageContext,
  deps: StepDeps,
  documentIds: string[],
): Promise<ReadResult> {
  await ctx.enter("reading");
  const extraction = await runExtractionStage(
    { uid: ctx.uid, runKind: ctx.run.kind, documentIds },
    { storage: deps.storage, records: deps.records, model: deps.model, log: ctx.log },
  );

  await ctx.enter("cleaning");
  const history = await deps.records.listTransactionsBefore(ctx.uid, ctx.run.month);
  const cleaned = await normalize(
    { transactions: extraction.transactions, history },
    deps.model,
    ctx.log,
  );
  // The classified rows replace the extracted ones (same ids); the duplicates go.
  await deps.records.writeRecords(ctx.uid, {
    transactions: cleaned.transactions,
    loans: [],
    holdings: [],
  });
  if (cleaned.removedDuplicates.length > 0) {
    await deps.records.deleteTransactions(
      ctx.uid,
      cleaned.removedDuplicates.map((t) => t.id),
    );
  }
  for (const warning of cleaned.warnings) ctx.log(`cleaning: ${warning}`);

  return {
    extracted: extraction.extracted,
    failed: extraction.failed,
    transactions: cleaned.transactions,
    loans: extraction.loans,
    holdings: extraction.holdings,
  };
}

/** Stage 4: the month's snapshot from the cleaned records, carried from the previous month. */
export async function buildMonth(
  ctx: StageContext,
  deps: StepDeps,
  read: ReadResult,
  user: UserContext,
): Promise<MonthRecord> {
  const month = ctx.run.month;
  const earlier = (await ctx.store.listMonths(ctx.uid)).filter((m) => m.month < month);
  const previous = earlier[earlier.length - 1];
  const sources = read.extracted.map((s) => s.kind);
  const bankBalances = read.extracted
    .filter((s): s is ExtractedSource & { closingBalance: number } => isBalanceSource(s))
    .map((s) => s.closingBalance);

  const snapshot = buildSnapshot({
    month,
    transactions: read.transactions,
    loans: read.loans,
    holdings: read.holdings,
    profile: user.profile,
    sources,
    ...(bankBalances.length > 0 ? { bankBalances } : {}),
    ...(earlier.length > 0
      ? {
          incomeHistory: earlier.map(
            (m) => m.record.snapshot.computedNetIncome ?? m.record.snapshot.netIncome,
          ),
        }
      : {}),
    ...(previous
      ? {
          carriedFrom: {
            snapshot: previous.record.snapshot,
            sources: previous.record.sources.map((s) => s.kind),
          },
        }
      : {}),
  });
  if (snapshot.estimatedSources.length > 0) {
    ctx.log(`snapshot carries ${snapshot.estimatedSources.join(", ")} from ${previous?.month}`);
  }

  const record: MonthRecord = plainJson({
    snapshot,
    sources: read.extracted.map((s) => ({
      kind: s.kind,
      documentId: s.documentId,
      name: s.name,
    })),
    submittedAt: now(deps),
    runId: ctx.run.id,
  });
  await ctx.store.setMonth(ctx.uid, month, record);
  ctx.log(
    `snapshot ${month}: income Rp ${snapshot.netIncome}, liquid Rp ${snapshot.liquidAssets}, ${snapshot.loans.length} loan(s)`,
  );
  return record;
}

function isBalanceSource(s: ExtractedSource): boolean {
  return (s.kind === "bank" || s.kind === "ewallet") && s.closingBalance !== null;
}

export interface AnalyseInput {
  snapshot: Snapshot;
  user: UserContext;
  goalIds: string[];
  /** Choices to carry over per goal (recalculate), matched by the action's change. */
  previousChoices?: Record<string, { actions: Analysis["actions"]; choices: Analysis["choices"] }>;
}

/**
 * Stages 5 and 6 for every goal: "checking" simulates the no-change path and computes the
 * metrics for all goals, then "planning" runs the agent per goal and stores each Analysis.
 * Returns the analyses by goal id (stored ones included, for the delta).
 */
export async function analyseGoals(
  ctx: StageContext,
  deps: StepDeps,
  input: AnalyseInput,
): Promise<Record<string, Analysis>> {
  const { snapshot, user } = input;
  const month = ctx.run.month;
  const out: Record<string, Analysis> = {};

  await ctx.enter("checking");
  const pending: {
    goal: Goal;
    withoutPlan: ReturnType<typeof simulate>;
    metrics: Analysis["metrics"];
  }[] = [];
  for (const goalId of input.goalIds) {
    const goal = await loadGoal(ctx, goalId);
    const existing = await ctx.store.getAnalysis(ctx.uid, goalId, month);
    if (existing?.runId === ctx.run.id) {
      ctx.log(`goal ${goalId}: analysis already written by this run, kept`);
      out[goalId] = existing;
      continue;
    }
    const withoutPlan = simulate({
      snapshot,
      profile: user.profile,
      goal,
      rules: user.rules,
      changes: [],
    });
    const metrics = computeMetrics({
      snapshot,
      profile: user.profile,
      goal,
      rules: user.rules,
      simulation: withoutPlan,
    });
    ctx.log(
      `goal ${goalId}: ${metrics.filter((m) => m.status === "blocks").length} blocking metric(s), loan path ${withoutPlan.loan?.monthsToReady ?? "n/a"}, cash path ${withoutPlan.cash.monthsToReady}`,
    );
    pending.push({ goal, withoutPlan, metrics });
  }

  if (pending.length === 0) return out;
  await ctx.enter("planning");
  for (const { goal, withoutPlan, metrics } of pending) {
    const agent = await runAgent(
      {
        snapshot,
        profile: user.profile,
        goal,
        rules: user.rules,
        withoutPlan,
        dismissed: user.dismissed,
      },
      deps.model,
      { log: (m) => ctx.log(`goal ${goal.id}: ${m}`) },
    );
    const previous = input.previousChoices?.[goal.id];
    const analysis: Analysis = plainJson({
      goalId: goal.id,
      month,
      metrics,
      withoutPlan: agent.withoutPlan,
      withPlan: agent.withPlan,
      actions: agent.actions,
      choices: previous ? carryChoices(agent.actions, previous) : agent.choices,
      rejectedOptions: agent.rejectedOptions,
      summary: agent.summary,
      runId: ctx.run.id,
    });
    await ctx.store.setAnalysis(ctx.uid, goal.id, month, analysis);
    ctx.note(goal.id, {
      toolCalls: agent.toolCalls,
      stoppedBecause: agent.stoppedBecause,
      warnings: agent.warnings,
    });
    ctx.log(
      `goal ${goal.id}: ${agent.actions.length} action(s) after ${agent.toolCalls} tool call(s); "${agent.summary}"`,
    );
    out[goal.id] = analysis;
  }
  return out;
}

/** The goal, which must exist and be priced; otherwise the run fails with a message. */
export async function loadGoal(ctx: StageContext, goalId: string): Promise<Goal> {
  const goal = await ctx.store.getGoal(ctx.uid, goalId);
  if (!goal) throw new PipelineError("The goal was deleted before the analysis could run.");
  if (!goal.estimate) {
    throw new PipelineError(
      "Calculate the goal's price estimate before submitting the statements.",
    );
  }
  return goal;
}

/** Keeps a user's choice for a new action whose change matches an earlier action's. */
export function carryChoices(
  actions: Analysis["actions"],
  previous: { actions: Analysis["actions"]; choices: Record<string, ActionChoice> },
): Record<string, ActionChoice> {
  const key = (c: Analysis["actions"][number]["change"]) =>
    `${c.type}|${"loanId" in c ? c.loanId : ""}|${"category" in c ? c.category : ""}`;
  const earlier = new Map(previous.actions.map((a) => [key(a.change), previous.choices[a.id]]));
  return Object.fromEntries(
    actions.map((a) => [a.id, earlier.get(key(a.change)) ?? ("undecided" as const)]),
  );
}

export function now(deps: StepDeps): string {
  return (deps.now ?? (() => new Date()))().toISOString();
}

/** The source kinds read this month, for logs and the delta. */
export function kindsOf(sources: { kind: SourceKind }[]): SourceKind[] {
  return sources.map((s) => s.kind);
}
