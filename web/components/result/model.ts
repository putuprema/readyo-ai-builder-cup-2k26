import type {
  Analysis,
  CarInputs,
  Goal,
  HouseInputs,
  LoanPathResult,
  Metric,
  MetricStatus,
  SimulationResult,
  WeddingInputs,
} from "@adidi/shared";
import {
  bigFigure,
  formatRupiah,
  monthName,
  monthsCount,
  monthsText,
  nextMonthKey,
  pct,
  perMonth,
  yearsText,
} from "./format";
import { ruleLabel } from "./rule-labels";

// Everything the result page shows, derived from the goal and its analysis document by
// selection and formatting only (specs/11-ui-progress-result.md: no arithmetic in the browser).

export type LeadingPath = "cash" | "loan";

/** Loan leads unless the goal is a wedding or the person prefers cash (specs/06-agent.md). */
export function leadingPath(goal: Goal): LeadingPath {
  return goal.type === "wedding" || goal.payPreference === "cash" ? "cash" : "loan";
}

export function loanProduct(goal: Goal): string {
  return goal.type === "car" ? "KKB" : "KPR";
}

function goalTypeLabel(goal: Goal): string {
  switch (goal.type) {
    case "house":
      return "Buy a house";
    case "car":
      return "Buy a car";
    case "wedding":
      return "Wedding";
  }
}

function goalPlace(goal: Goal): string {
  switch (goal.type) {
    case "house":
      return (goal.inputs as HouseInputs).area;
    case "car":
      return (goal.inputs as CarInputs).modelOrSegment;
    case "wedding":
      return (goal.inputs as WeddingInputs).city;
  }
}

/** "2028" for house and car, "June 2027" for a wedding. */
export function goalWhen(goal: Goal): string {
  if (goal.type === "wedding") return monthName((goal.inputs as WeddingInputs).targetMonth);
  return String((goal.inputs as HouseInputs | CarInputs).targetYear);
}

/** "Buy a house · Tangerang Selatan · target Rp 1.52 bn in 2028". */
export function eyebrow(goal: Goal): string {
  const parts = [goalTypeLabel(goal), goalPlace(goal)];
  const target = goal.estimate?.userOverride ?? goal.estimate?.targetAtGoalDate;
  parts.push(
    target === undefined
      ? `target ${goalWhen(goal)}`
      : `target ${formatRupiah(target)} in ${goalWhen(goal)}`,
  );
  return parts.join(" · ");
}

/** The sentence under the headline. No counts: the table below carries them. */
export function subline(analysis: Analysis): string {
  const blocks = analysis.metrics.some((m) => m.status === "blocks");
  const based = `Based on ${monthName(analysis.month)} statements.`;
  return blocks
    ? `${based} Some checks below block a bank approval today; the plan has been checked month by month.`
    : `${based} Nothing blocks a bank approval today; the plan below has been checked month by month.`;
}

// ---- path cards ----

export interface PathRow {
  label: string;
  value: string;
}

export interface PathCard {
  path: LeadingPath;
  title: string;
  leading: boolean;
  badge: { text: string; tone: "blocked" | "passes" | "muted" };
  big: { value: string; unit: string };
  rows: PathRow[];
  /** The red strip on the loan card: what blocks approval today; empty when approvable. */
  blockedBy: string[];
  note?: string;
}

/** The result the "with the plan" figures come from: the user's choices once made, else the plan. */
export function currentPlan(analysis: Analysis): SimulationResult {
  return analysis.withChoices ?? analysis.withPlan;
}

function dpRatioOf(result: SimulationResult): number | undefined {
  return result.rulesChecked.find((r) => r.rule.startsWith("min_dp_"))?.valueUsed;
}

function blockedByText(
  blocked: LoanPathResult["blockedBy"],
  loan: LoanPathResult,
  product: string,
): string[] {
  return blocked
    .map((b) => {
      switch (b.rule) {
        case "dti_cap":
          return `DTI ${pct(b.value)} vs ${pct(b.limit)} cap`;
        case "emergency_months_required":
        case "emergency_months_required_freelance":
          return `Emergency fund ${monthsCount(b.value)} vs ${monthsCount(b.limit)} needed`;
        case "loan_end_age":
          return `Age ${b.value}: no ${product} tenor ends by ${b.limit}`;
        default:
          if (b.rule.startsWith("min_dp_")) {
            return `Down payment ${formatRupiah(b.value)} vs ${formatRupiah(b.limit)} needed`;
          }
          return `${ruleLabel(b.rule)}: ${b.value} vs ${b.limit}`;
      }
    })
    .concat(loan.approvableToday ? [] : []);
}

export function pathCards(goal: Goal, analysis: Analysis): PathCard[] {
  const lead = leadingPath(goal);
  const product = loanProduct(goal);
  const without = analysis.withoutPlan;
  const plan = currentPlan(analysis);
  const cards: PathCard[] = [];

  if (without.loan && plan.loan) {
    const loanLeads = lead === "loan";
    const today = without.loan.approvableToday;
    const dpRatio = dpRatioOf(without);
    const dpNeeded = without.loan.timeline[0]?.dpNeeded;
    const rows: PathRow[] = [
      { label: "Without changes", value: monthsText(without.loan.monthsToReady) },
    ];
    if (dpNeeded !== undefined) {
      rows.push({
        label:
          dpRatio === undefined ? "Down payment needed" : `Down payment needed (${pct(dpRatio)})`,
        value: formatRupiah(dpNeeded),
      });
    }
    if (plan.loan.installmentAtApproval !== undefined) {
      const tenor = plan.loan.tenorYears === undefined ? "" : ` · ${plan.loan.tenorYears} yrs`;
      rows.push({
        label: "Monthly installment at approval",
        value: `${perMonth(plan.loan.installmentAtApproval)}${tenor}`,
      });
    }
    cards.push({
      path: "loan",
      title: loanLeads ? `${product} path · your preference` : `${product} path`,
      leading: loanLeads,
      badge: today
        ? { text: "Approvable today", tone: "passes" }
        : { text: "Not approvable today", tone: "blocked" },
      big: bigFigure(plan.loan.monthsToReady, "months"),
      rows,
      blockedBy: blockedByText(without.loan.blockedBy, without.loan, product),
    });
  }

  const cashLeads = lead === "cash";
  const cashRows: PathRow[] = [
    { label: "Without changes", value: yearsText(without.cash.monthsToReady) },
  ];
  const needed =
    goal.type === "wedding"
      ? goal.estimate?.savingsTarget
      : (goal.estimate?.userOverride ?? goal.estimate?.targetAtGoalDate);
  if (needed !== undefined) {
    cashRows.push({
      label:
        goal.type === "wedding" ? "Your share of the cost" : `Needed in ${goalWhen(goal)} money`,
      value: formatRupiah(needed),
    });
  }
  const liquid = without.cash.timeline[0]?.liquid;
  if (liquid !== undefined)
    cashRows.push({ label: "Liquid savings today", value: formatRupiah(liquid) });
  cards.push({
    path: "cash",
    title:
      goal.type === "wedding"
        ? "Savings path"
        : cashLeads
          ? "Cash path · your preference"
          : "Cash path",
    leading: cashLeads,
    badge: cashLeads
      ? plan.cash.monthsToReady === 0
        ? { text: "Ready today", tone: "passes" }
        : { text: "Your plan", tone: "muted" }
      : { text: "For comparison", tone: "muted" },
    big: bigFigure(plan.cash.monthsToReady, "years"),
    rows: cashRows,
    blockedBy: [],
    note: cashLeads
      ? undefined
      : `Saving the full price takes far longer than the ${product} path, which is why the ${product} path leads.`,
  });

  return cashLeads ? cards.reverse() : cards;
}

// ---- readiness table ----

export interface MetricRow {
  id: string;
  label: string;
  you: string;
  rule: string;
  status: MetricStatus;
  statusLabel: string;
  meaning: string;
}

export const STATUS_LABEL: Record<MetricStatus, string> = {
  passes: "Passes",
  needs_work: "Needs work",
  blocks: "Blocks",
};

export function metricRow(m: Metric): MetricRow {
  let you: string;
  let rule: string;
  switch (m.id) {
    case "net_income":
      you = perMonth(m.you);
      rule = "—";
      break;
    case "dti":
      you = pct(m.you);
      rule = m.rule === undefined ? "—" : `≤ ${pct(m.rule)}`;
      break;
    case "emergency_fund":
      you = monthsCount(m.you);
      rule = m.rule === undefined ? "—" : `≥ ${monthsCount(m.rule)}`;
      break;
    case "expensive_debt":
      you = formatRupiah(m.you);
      rule = "Rp 0 before applying";
      break;
    case "savings_rate":
      you = pct(m.you);
      rule = m.rule === undefined ? "—" : `≥ ${pct(m.rule)}`;
      break;
    case "goal_progress":
      you = pct(m.you);
      rule = "100%";
      break;
    case "horizon_risk":
      you = `${pct(m.you)} volatile`;
      rule = m.rule === undefined ? "—" : `< ${pct(m.rule)} volatile`;
      break;
    default:
      you = String(m.you);
      rule = m.rule === undefined ? "—" : String(m.rule);
  }
  return {
    id: m.id,
    label: m.label,
    you,
    rule,
    status: m.status,
    statusLabel: STATUS_LABEL[m.status],
    meaning: m.meaning,
  };
}

// ---- bottom cards ----

export interface AssumptionRow {
  label: string;
  value: string;
}

/** The values the simulation used, from rulesChecked, in the design's order. */
export function assumptionRows(analysis: Analysis): AssumptionRow[] {
  const rows: AssumptionRow[] = [];
  for (const r of analysis.withoutPlan.rulesChecked) {
    if (r.rule === "dti_cap")
      rows.push({ label: "DTI cap used by banks", value: pct(r.valueUsed) });
    else if (r.rule.startsWith("min_dp_"))
      rows.push({ label: ruleLabel(r.rule), value: pct(r.valueUsed) });
    else if (r.rule === "kpr_rate_fixed" || r.rule === "kkb_rate")
      rows.push({
        label: ruleLabel(r.rule),
        value: `${(r.valueUsed * 100).toFixed(1).replace(/\.0$/, "")}%`,
      });
    else if (r.rule.startsWith("growth_"))
      rows.push({ label: ruleLabel(r.rule), value: `${pct(r.valueUsed)} / yr` });
    else if (r.rule.startsWith("emergency_months_required"))
      rows.push({ label: ruleLabel(r.rule), value: monthsCount(r.valueUsed) });
  }
  return rows;
}

export interface CheckIn {
  /** "Upload October" */
  uploadLabel: string;
  /** "Upload October's statements any time from 1 November. …" */
  sentence: string;
  /** The month the committed line names: "October". */
  nextMonth: string;
}

export function checkIn(analysis: Analysis): CheckIn {
  const next = nextMonthKey(analysis.month);
  const after = nextMonthKey(next);
  const nextName = monthName(next).split(" ")[0] as string;
  const afterName = monthName(after).split(" ")[0] as string;
  return {
    uploadLabel: `Upload ${nextName}`,
    sentence: `Upload ${nextName}'s statements any time from 1 ${afterName}. We'll show what moved, which actions you kept, and the revised month count.`,
    nextMonth: nextName,
  };
}
