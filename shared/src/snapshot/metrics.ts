import { formatRupiah } from "../format.js";
import { type Rules, requireRule } from "../rules.js";
import { monthsBetween } from "../simulate/money.js";
import { goalDateOf, VOLATILE_COUNTS_FROM_MONTHS } from "../simulate/simulate.js";
import type {
  Goal,
  Loan,
  Metric,
  MetricStatus,
  Profile,
  SimulationResult,
  Snapshot,
} from "../types.js";

// The seven readiness metrics (specs/03-snapshot-metrics.md, "Metrics"; docs/analysis.md,
// "Readiness metrics"). Pure code over the snapshot, the rules table and the simulation's
// month 0, so the table can never disagree with the path cards. Every threshold is a rule;
// the `meaning` sentences are templates with the numbers filled in here. Gemini may rephrase
// them later, never recompute them.

export interface ComputeMetricsInput {
  snapshot: Snapshot;
  profile: Profile;
  goal: Goal;
  rules: Rules; // merged defaults + overrides
  simulation: SimulationResult; // simulate() over the same snapshot, no changes
}

/** Metric ids in display order. */
export const METRIC_IDS = [
  "net_income",
  "dti",
  "emergency_fund",
  "expensive_debt",
  "savings_rate",
  "goal_progress",
  "horizon_risk",
] as const;

export type MetricId = (typeof METRIC_IDS)[number];

const rp = formatRupiah;

/** 0.382 → "38%". */
export function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** 0.5 → "0.5 months", 1 → "1 month", 4.63 → "4.6 months". */
export function months(n: number): string {
  const shown = Number(n.toFixed(1));
  return `${shown} ${shown === 1 ? "month" : "months"}`;
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function listLenders(loans: Loan[]): string {
  const names = [...new Set(loans.map((l) => l.lender))];
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The loan product the goal would use, for the sentences. */
function loanName(goal: Goal): string {
  return goal.type === "car" ? "KKB" : "KPR";
}

/** Monthly surplus as simulate() computes it for month 0. */
export function monthlySurplus(s: Snapshot): number {
  return (
    s.netIncome - s.essentialSpending - s.discretionarySpending - s.cashWithdrawals - s.debtPayments
  );
}

export function computeMetrics(input: ComputeMetricsInput): Metric[] {
  const { snapshot: s, profile, goal, rules, simulation } = input;
  const loanMonth0 = simulation.loan?.timeline[0];
  const cashMonth0 = simulation.cash.timeline[0];
  if (!cashMonth0) throw new Error("computeMetrics: the simulation has no month 0");
  const product = loanName(goal);

  // ---- net_income ----
  const incomeParts: string[] = [];
  const confirmed = s.computedNetIncome !== undefined && s.computedNetIncome !== s.netIncome;
  incomeParts.push(
    confirmed
      ? `${rp(s.netIncome)} a month as you confirmed; your statements show ${rp(s.computedNetIncome ?? 0)}, own-account transfers excluded.`
      : `${rp(s.netIncome)} a month, own-account transfers excluded.`,
  );
  if (s.estimatedSources.includes("bank")) {
    incomeParts.push("No bank statement this month, so last month's figures were carried.");
  }
  if (profile.employment === "freelance" && s.incomeVariability !== undefined) {
    incomeParts.push(
      `Income varied by ${pct(s.incomeVariability)} month to month; banks treat unstable income as lower.`,
    );
  }
  const netIncome: Metric = {
    id: "net_income",
    label: "Verified net income",
    you: s.netIncome,
    status: "passes",
    meaning: incomeParts.join(" "),
  };

  // ---- dti ----
  const dtiCap = requireRule(rules, "dti_cap");
  const incomeForDti = Math.max(1, s.netIncome);
  const debtOnly = s.debtPayments / incomeForDti;
  let dti: Metric;
  if (simulation.loan) {
    const you = loanMonth0?.dti ?? debtOnly;
    const over = you > dtiCap;
    const installment = loanMonth0?.installment;
    let meaning: string;
    if (installment === undefined) {
      meaning = `No ${product} tenor of at least a year is allowed at your age, so no installment could be checked. Existing debt takes ${pct(debtOnly)} of your income; banks cap it at ${pct(dtiCap)}.`;
    } else if (s.debtPayments > 0) {
      meaning = `${listLenders(s.loans)} ${rp(s.debtPayments)}/mo plus the ${product} installment of ${rp(installment)} would take ${pct(you)} of your income; banks cap it at ${pct(dtiCap)}${over ? "" : ", so this passes"}.`;
    } else {
      meaning = `The ${product} installment of ${rp(installment)} would take ${pct(you)} of your income, ${over ? "above" : "under"} the ${pct(dtiCap)} cap banks use.`;
    }
    dti = {
      id: "dti",
      label: "Debt-to-income",
      you: round(you, 4),
      rule: dtiCap,
      status: over ? "blocks" : "passes",
      meaning,
    };
  } else {
    // Wedding: no loan, so debt never blocks, but every installment slows the saving.
    const over = debtOnly > dtiCap;
    dti = {
      id: "dti",
      label: "Debt-to-income",
      you: round(debtOnly, 4),
      rule: dtiCap,
      status: over ? "needs_work" : "passes",
      meaning:
        s.debtPayments > 0
          ? `${listLenders(s.loans)} ${rp(s.debtPayments)}/mo takes ${pct(debtOnly)} of your income${over ? `, above the ${pct(dtiCap)} banks use` : ""}. No loan is involved, but every installment slows your saving.`
          : "No debt payments this month. No loan is involved in this goal.",
    };
  }

  // ---- emergency_fund ----
  const emergencyRequired = requireRule(
    rules,
    profile.employment === "freelance"
      ? "emergency_months_required_freelance"
      : "emergency_months_required",
  );
  const emergencyMonths =
    s.essentialSpending > 0
      ? s.liquidAssets / s.essentialSpending
      : s.liquidAssets > 0
        ? emergencyRequired
        : 0;
  const emergencyShort = emergencyMonths < emergencyRequired;
  const emergencyFund: Metric = {
    id: "emergency_fund",
    label: "Emergency fund",
    you: round(emergencyMonths, 2),
    rule: emergencyRequired,
    status: emergencyShort ? "blocks" : "passes",
    meaning: emergencyShort
      ? `Liquid savings of ${rp(s.liquidAssets)} cover ${months(emergencyMonths)} of essential spending; we require ${months(emergencyRequired)} before applying.`
      : `Liquid savings of ${rp(s.liquidAssets)} cover ${months(emergencyMonths)} of essential spending, at or above the ${months(emergencyRequired)} required.`,
  };

  // ---- expensive_debt ----
  const expensiveRate = requireRule(rules, "expensive_debt_rate");
  const expensiveLoans = s.loans.filter((l) => l.effectiveAnnualRate > expensiveRate);
  const expensiveOutstanding = expensiveLoans.reduce((sum, l) => sum + l.outstandingPrincipal, 0);
  const expensiveDebt: Metric = {
    id: "expensive_debt",
    label: "Expensive debt",
    you: expensiveOutstanding,
    rule: 0,
    status: expensiveOutstanding > 0 ? "needs_work" : "passes",
    meaning:
      expensiveOutstanding > 0
        ? `${rp(expensiveOutstanding)} outstanding at ${expensiveLoans.map((l) => pct(l.effectiveAnnualRate)).join(" and ")} a year (${listLenders(expensiveLoans)}). Banks want debt above ${pct(expensiveRate)} a year cleared before a ${product}.`
        : `No debt above ${pct(expensiveRate)} a year.`,
  };

  // ---- savings_rate ----
  const good = requireRule(rules, "savings_rate_good");
  const minimum = requireRule(rules, "savings_rate_min");
  const surplus = monthlySurplus(s);
  const savings = s.netIncome > 0 ? surplus / s.netIncome : 0;
  const savingsStatus: MetricStatus =
    savings >= good ? "passes" : savings >= minimum ? "needs_work" : "blocks";
  const savingsRate: Metric = {
    id: "savings_rate",
    label: "Savings rate",
    you: round(savings, 4),
    rule: good,
    status: savingsStatus,
    meaning:
      surplus >= 0
        ? `You keep ${rp(surplus)} of ${rp(s.netIncome)} (${pct(savings)}) after spending and debt payments; ${pct(good)} is the target, under ${pct(minimum)} blocks.`
        : `You spend ${rp(-surplus)} more than you earn each month; ${pct(good)} saved is the target, under ${pct(minimum)} blocks.`,
  };

  // ---- goal_progress ----
  const reserve = emergencyRequired * s.essentialSpending;
  const earmarked = Math.max(0, s.liquidAssets - reserve);
  const onLoanPath = simulation.loan !== undefined && goal.payPreference !== "cash";
  const needed = onLoanPath ? (loanMonth0?.dpNeeded ?? 0) : cashMonth0.target;
  const progress = needed > 0 ? earmarked / needed : 1;
  const what = onLoanPath
    ? `the ${rp(needed)} down payment (${pct(needed / Math.max(1, cashMonth0.target))} of the price today)`
    : goal.type === "wedding"
      ? `the ${rp(needed)} wedding savings target (your share)`
      : `the ${rp(needed)} price today`;
  const goalProgress: Metric = {
    id: "goal_progress",
    label: onLoanPath ? "Down payment progress" : "Savings progress",
    you: round(progress, 4),
    rule: 1,
    status: progress >= 1 ? "passes" : "needs_work",
    meaning:
      progress >= 1
        ? `${rp(earmarked)} earmarked after the ${months(emergencyRequired)} emergency fund covers ${what}.`
        : earmarked > 0
          ? `${rp(earmarked)} saved of ${what}, after setting aside ${months(emergencyRequired)} of essentials.`
          : `${rp(s.liquidAssets)} liquid, but the ${months(emergencyRequired)} emergency fund (${rp(reserve)}) comes first, so nothing is earmarked yet for ${what}.`,
  };

  // ---- horizon_risk ----
  const maxShare = requireRule(rules, "horizon_volatile_share_max");
  const monthsToGoal = monthsBetween(s.month, goalDateOf(goal));
  const near = monthsToGoal < VOLATILE_COUNTS_FROM_MONTHS;
  const total = s.liquidAssets + s.volatileAssets;
  const share = total > 0 ? s.volatileAssets / total : 0;
  const risky = near && share > maxShare;
  const horizonRisk: Metric = {
    id: "horizon_risk",
    label: "Horizon vs risk",
    you: round(share, 4),
    rule: maxShare,
    status: risky ? "needs_work" : "passes",
    meaning: near
      ? risky
        ? `${pct(share)} of your savings are in volatile assets (${rp(s.volatileAssets)}) with the goal under three years away; they count at zero until moved to something stable.`
        : `${pct(share)} of your savings are in volatile assets with the goal under three years away, within the ${pct(maxShare)} limit.`
      : `The goal is ${monthsToGoal} months away, so volatile assets (${pct(share)} of savings) still count toward it; keep the share under ${pct(maxShare)} once it is within three years.`,
  };

  return [netIncome, dti, emergencyFund, expensiveDebt, savingsRate, goalProgress, horizonRisk];
}
