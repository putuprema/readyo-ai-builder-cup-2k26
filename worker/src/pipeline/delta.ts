import {
  type ActionCard,
  type Analysis,
  type CommittedActionCheck,
  formatRupiah,
  type Goal,
  type Loan,
  type MetricChange,
  type MonthlyDelta,
  type Snapshot,
} from "@adidi/shared";
import { z } from "zod";
import { categoryLabel, monthsText } from "../agent/cards.js";
import { leadingPathOf } from "../agent/context.js";
import { planMonths } from "../agent/index.js";
import { checkNumbers } from "../agent/numbers.js";
import { geminiJsonSchema } from "../extraction/schemas.js";
import { type JsonModel, ModelError } from "../gemini/client.js";

// Stage 7, the monthly delta (specs/07-pipeline-runs.md; docs/analysis.md "Monthly delta"):
// compare the new month's snapshot and analysis with the previous one. Code supplies every
// number: the metrics that moved, whether each committed action shows in the new statements,
// and the months to ready before and after. Gemini writes the two-sentence summary from those
// numbers, checked with the agent's number check and replaced by a template when it slips.

export interface DeltaInput {
  goal: Goal;
  previous: { month: string; snapshot: Snapshot; analysis: Analysis };
  current: { snapshot: Snapshot; analysis: Analysis };
}

export interface DeltaFacts {
  delta: Omit<MonthlyDelta, "summary">;
  /** Label → value, everything the writer may quote. */
  facts: Record<string, string>;
  /** The code-built two sentences. */
  fallback: string;
}

/**
 * A metric moved when its status changed, or its value changed by more than this share and
 * reads differently once formatted (26.2% → 25.8% both read "26%" and do not count).
 */
export const METRIC_CHANGE_TOLERANCE = 0.005;
/** Volatile assets must fall by this share of the amount for a move to count as done. */
export const MOVE_TOLERANCE = 0.9;

export function computeDelta(input: DeltaInput): DeltaFacts {
  const metricsChanged = changedMetrics(input.previous.analysis, input.current.analysis);
  const committedActions = checkCommittedActions(input);
  const leadingPath = leadingPathOf(input.goal);
  const monthsToReady = {
    leadingPath,
    old: planMonths(input.previous.analysis.withoutPlan, leadingPath),
    new: planMonths(input.current.analysis.withoutPlan, leadingPath),
  };
  const delta = {
    previousMonth: input.previous.month,
    metricsChanged,
    committedActions,
    monthsToReady,
  };
  const facts = deltaFacts(delta, input);
  return { delta, facts, fallback: fallbackSummary(delta, input) };
}

export function changedMetrics(previous: Analysis, current: Analysis): MetricChange[] {
  const out: MetricChange[] = [];
  for (const metric of current.metrics) {
    const before = previous.metrics.find((m) => m.id === metric.id);
    if (!before) continue;
    const moved =
      before.status !== metric.status ||
      (Math.abs(metric.you - before.you) >
        METRIC_CHANGE_TOLERANCE * Math.max(1, Math.abs(before.you)) &&
        metricValue(metric.id, metric.you) !== metricValue(metric.id, before.you));
    if (!moved) continue;
    out.push({
      id: metric.id,
      label: metric.label,
      oldValue: before.you,
      newValue: metric.you,
      oldStatus: before.status,
      newStatus: metric.status,
    });
  }
  return out;
}

export function checkCommittedActions(input: DeltaInput): CommittedActionCheck[] {
  const { previous, current } = input;
  return previous.analysis.actions
    .filter((a) => previous.analysis.choices[a.id] === "committed")
    .map((action) => checkOne(action, previous.snapshot, current.snapshot));
}

function checkOne(action: ActionCard, before: Snapshot, after: Snapshot): CommittedActionCheck {
  const base = { actionId: action.id, title: action.title, change: action.change };
  const change = action.change;
  switch (change.type) {
    case "pay_off_loan": {
      const old = before.loans.find((l) => l.id === change.loanId);
      const now = old ? sameLoan(after.loans, old) : undefined;
      if (!old) return { ...base, kept: true, evidence: "The loan no longer appears" };
      return now
        ? {
            ...base,
            kept: false,
            evidence: `${old.lender} still shows ${formatRupiah(now.outstandingPrincipal)} outstanding`,
          }
        : { ...base, kept: true, evidence: `${old.lender} balance gone` };
    }
    case "refinance_loan": {
      const old = before.loans.find((l) => l.id === change.loanId);
      if (!old) return { ...base, kept: true, evidence: "The loan no longer appears" };
      const now = sameLoan(after.loans, old);
      if (!now) return { ...base, kept: true, evidence: `${old.lender} balance gone` };
      return now.monthlyInstallment < old.monthlyInstallment
        ? {
            ...base,
            kept: true,
            evidence: `${old.lender} installment ${formatRupiah(old.monthlyInstallment)} → ${formatRupiah(now.monthlyInstallment)}`,
          }
        : {
            ...base,
            kept: false,
            evidence: `${old.lender} installment unchanged at ${formatRupiah(now.monthlyInstallment)}`,
          };
    }
    case "cap_spending": {
      const spent = after.discretionaryByCategory[change.category] ?? 0;
      const label = capitalize(categoryLabel(change.category));
      return spent <= change.monthlyCap
        ? {
            ...base,
            kept: true,
            evidence: `${label} ${formatRupiah(spent)}, within the ${formatRupiah(change.monthlyCap)} cap`,
          }
        : {
            ...base,
            kept: false,
            evidence: `${label} ${formatRupiah(spent)}, above the ${formatRupiah(change.monthlyCap)} cap`,
          };
    }
    case "move_assets": {
      const fell = before.volatileAssets - after.volatileAssets;
      const evidence = `Volatile assets ${formatRupiah(before.volatileAssets)} → ${formatRupiah(after.volatileAssets)}`;
      return fell >= MOVE_TOLERANCE * change.amount
        ? { ...base, kept: true, evidence }
        : { ...base, kept: false, evidence: `${evidence}, not moved` };
    }
  }
}

/** Loan ids change with every statement, so a loan is matched by lender and type. */
function sameLoan(loans: Loan[], old: Loan): Loan | undefined {
  const lender = old.lender.trim().toLowerCase();
  return loans.find(
    (l) =>
      l.outstandingPrincipal > 0 && l.type === old.type && l.lender.trim().toLowerCase() === lender,
  );
}

function deltaFacts(
  delta: Omit<MonthlyDelta, "summary">,
  input: DeltaInput,
): Record<string, string> {
  const facts: Record<string, string> = {
    previousMonth: monthName(delta.previousMonth),
    month: monthName(input.current.snapshot.month),
    readyBefore: when(delta.monthsToReady.old),
    readyNow: when(delta.monthsToReady.new),
    metricsMoved: String(delta.metricsChanged.length),
  };
  // With nothing committed the counts stay out, so the note cannot say "0 of your 0".
  if (delta.committedActions.length === 0) {
    facts.committedActions = "none, so do not mention committed actions";
  } else {
    facts.actionsKept = String(delta.committedActions.filter((a) => a.kept).length);
    facts.actionsCommitted = String(delta.committedActions.length);
  }
  delta.metricsChanged.forEach((m, i) => {
    facts[`metric${i + 1}`] =
      `${m.label}: ${metricValue(m.id, m.oldValue)} → ${metricValue(m.id, m.newValue)} (${m.oldStatus.replace("_", " ")} → ${m.newStatus.replace("_", " ")})`;
  });
  delta.committedActions.forEach((a, i) => {
    facts[`action${i + 1}`] = `${a.title}: ${a.kept ? "kept" : "not yet"} (${a.evidence})`;
  });
  return facts;
}

export function fallbackSummary(delta: Omit<MonthlyDelta, "summary">, input: DeltaInput): string {
  const month = monthName(input.current.snapshot.month);
  const moved = delta.metricsChanged.length;
  const first =
    moved === 0
      ? `Your numbers for ${month} are in line with ${monthName(delta.previousMonth)}.`
      : `${moved === 1 ? "One metric" : `${moved} metrics`} moved in ${month}: ${delta.metricsChanged
          .slice(0, 2)
          .map(
            (m) =>
              `${m.label.toLowerCase()} ${metricValue(m.id, m.oldValue)} → ${metricValue(m.id, m.newValue)}`,
          )
          .join(", ")}.`;
  const kept = delta.committedActions.filter((a) => a.kept).length;
  const total = delta.committedActions.length;
  const actions =
    total === 0
      ? ""
      : kept === total
        ? ` You kept ${total === 1 ? "your committed action" : `all ${total} committed actions`}.`
        : ` ${kept} of ${total} committed actions show in the statements.`;
  const ready = `${readinessChange(delta.monthsToReady)}${actions}`;
  return `${first} ${ready}`.trim();
}

function readinessChange(m: MonthlyDelta["monthsToReady"]): string {
  if (m.old === m.new) return `Readiness is unchanged at ${when(m.new)}.`;
  if (m.new === null) return `Readiness slipped: ${when(m.old)} before, not within 30 years now.`;
  if (m.old === null) return `Readiness improved: not within 30 years before, ${when(m.new)} now.`;
  return m.new < m.old
    ? `Readiness improved: ${when(m.old)} before, ${when(m.new)} now.`
    : `Readiness slipped: ${when(m.old)} before, ${when(m.new)} now.`;
}

export function when(m: number | null): string {
  if (m === null) return "not within 30 years";
  if (m === 0) return "this month";
  return monthsText(m);
}

function metricValue(id: string, value: number): string {
  switch (id) {
    case "net_income":
    case "expensive_debt":
      return formatRupiah(value);
    case "emergency_fund":
      return `${Number(value.toFixed(1))} months`;
    default:
      return `${Math.round(value * 100)}%`;
  }
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthName(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return `${MONTHS[(month ?? 1) - 1]} ${year}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---- the summary ----

export const DELTA_SYSTEM_INSTRUCTION = `You write the "since last month" note of a financial readiness planner for people in Indonesia, in plain English, in the second person.

Rules:
- Exactly two sentences. The first says what moved (or that nothing did); the second says how readiness changed and, only if there are committed actions, whether they show in the statements.
- Use only the numbers given in the facts, written exactly as given (for example "Rp 12.4 m", "38%", "17 months", "this month"). Never compute, convert, round or add a number, not even a year or a count written as a digit. If a number is not in the facts, leave it out.
- No emoji, no exclamation marks, no lists, no headings.`;

const deltaSummarySchema = z.object({ summary: z.string().describe("Exactly two sentences") });

export interface DeltaSummaryResult {
  summary: string;
  fromFallback: boolean;
  attempts: number;
  warnings: string[];
}

export async function writeDeltaSummary(
  facts: DeltaFacts,
  model: JsonModel,
  options: { maxAttempts?: number; log?: (message: string) => void } = {},
): Promise<DeltaSummaryResult> {
  const log = options.log ?? (() => {});
  const maxAttempts = options.maxAttempts ?? 2;
  const warnings: string[] = [];
  const allowed = Object.values(facts.facts);
  let feedback: string | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let raw: unknown;
    try {
      raw = await model.generateJson({
        tier: "flash",
        systemInstruction: DELTA_SYSTEM_INSTRUCTION,
        prompt: deltaPrompt(facts, feedback),
        responseJsonSchema: geminiJsonSchema(deltaSummarySchema),
        temperature: 0.2,
        thinking: "low",
      });
    } catch (error) {
      const message = error instanceof ModelError ? error.message : "The model call failed";
      warnings.push(`Delta summary attempt ${attempt} failed: ${message}`);
      continue;
    }
    const parsed = deltaSummarySchema.safeParse(raw);
    if (!parsed.success || parsed.data.summary.trim() === "") {
      warnings.push(`Delta summary attempt ${attempt}: no usable answer`);
      feedback = "Your previous answer was empty or did not match the schema.";
      continue;
    }
    const check = checkNumbers(parsed.data.summary, allowed);
    if (check.ok) {
      log(`delta summary accepted on attempt ${attempt}`);
      return {
        summary: parsed.data.summary.trim(),
        fromFallback: false,
        attempts: attempt,
        warnings,
      };
    }
    warnings.push(
      `Delta summary attempt ${attempt}: numbers not in the facts: ${check.offending.join(", ")}`,
    );
    feedback = `Your previous answer used numbers that are not in the facts (${check.offending.join(", ")}). Use only the numbers given, written exactly as given.`;
  }
  log("delta summary: template used");
  return { summary: facts.fallback, fromFallback: true, attempts: maxAttempts, warnings };
}

function deltaPrompt(facts: DeltaFacts, feedback: string | undefined): string {
  const lines = Object.entries(facts.facts).map(([k, v]) => `- ${k}: ${v}`);
  return [
    "Facts about this month compared with the previous one:",
    ...lines,
    "",
    "Write the two-sentence note.",
    ...(feedback ? ["", feedback] : []),
  ].join("\n");
}
