import { type Rules, requireRule } from "../rules.js";
import type {
  Change,
  Goal,
  MonthState,
  PathResult,
  Profile,
  SimulationResult,
  Snapshot,
  WeddingInputs,
} from "../types.js";
import { amortizeOneMonth, grow, monthsBetween } from "./money.js";

// simulate(): plays a person's finances forward month by month (specs/02-simulate.md,
// "Behavior"). Pure: no I/O, no clock, no randomness. Month 0 is the snapshot month as given;
// the state for month m is evaluated after the changes with fromMonth = m are applied and
// before that month's cash flow. Advancing to m + 1 adds the surplus, grows liquid savings,
// amortises each loan and decrements its tenor.

export interface SimulateInput {
  snapshot: Snapshot;
  profile: Profile;
  goal: Goal; // with estimate
  rules: Rules; // merged defaults + overrides
  changes: Change[];
  maxMonths?: number; // default 360
}

export const DEFAULT_MAX_MONTHS = 360;

/** Volatile assets count toward a cash target only when the goal date is this far away. */
export const VOLATILE_COUNTS_FROM_MONTHS = 36;

export interface LoanState {
  id: string;
  outstanding: number;
  installment: number;
  annualRate: number;
  remainingMonths: number;
}

/** The mutable state the loop carries from one month to the next. */
export interface LoopState {
  liquid: number;
  volatile: number;
  loans: LoanState[];
  /** Monthly caps on discretionary categories, from cap_spending changes. */
  caps: Record<string, number>;
}

export function simulate(input: SimulateInput): SimulationResult {
  const { snapshot, profile, goal, rules, changes } = input;
  const maxMonths = input.maxMonths ?? DEFAULT_MAX_MONTHS;
  const estimate = goal.estimate;
  if (!estimate) throw new Error("simulate: the goal has no estimate");

  const growthRate = requireRule(rules, growthRuleId(goal));
  const savingsRate = requireRule(rules, "return_money_market");
  const emergencyRequired = requireRule(
    rules,
    profile.employment === "freelance"
      ? "emergency_months_required_freelance"
      : "emergency_months_required",
  );
  const targetToday = targetTodayOf(goal);
  const monthsToGoalDate = monthsBetween(snapshot.month, goalDateOf(goal));
  const volatileCounts = monthsToGoalDate >= VOLATILE_COUNTS_FROM_MONTHS;
  const essential = snapshot.essentialSpending;

  const state: LoopState = {
    liquid: snapshot.liquidAssets,
    volatile: snapshot.volatileAssets,
    loans: snapshot.loans.map((l) => ({
      id: l.id,
      outstanding: l.outstandingPrincipal,
      installment: l.monthlyInstallment,
      annualRate: l.effectiveAnnualRate,
      remainingMonths: l.remainingTenorMonths,
    })),
    caps: {},
  };

  const cashTimeline: MonthState[] = [];
  let cashReadyMonth: number | null = null;

  for (let m = 0; m <= maxMonths; m++) {
    applyChanges(state, changes, m);

    const discretionary = discretionaryAfterCaps(snapshot, state.caps);
    const debtPayments = state.loans.reduce(
      (sum, l) => (l.remainingMonths > 0 ? sum + l.installment : sum),
      0,
    );
    const target = grow(targetToday, growthRate, m);
    const emergencyMonths = state.liquid / Math.max(essential, 1);
    const reserve = emergencyRequired * essential;

    // Cash path: liquid above the emergency reserve (plus volatile assets for far goals)
    // covers the target.
    const cashAvailable = state.liquid - reserve + (volatileCounts ? state.volatile : 0);
    const cashFailing: string[] = [];
    if (emergencyMonths < emergencyRequired) cashFailing.push("emergency_months_required");
    const cashReady = cashAvailable >= target && cashFailing.length === 0;
    if (cashReady && cashReadyMonth === null) cashReadyMonth = m;

    cashTimeline.push({
      month: m,
      liquid: Math.round(state.liquid),
      volatile: Math.round(state.volatile),
      debtPayments: Math.round(debtPayments),
      target: Math.round(target),
      emergencyMonths,
      failing: cashFailing,
    });

    // Advance to the next month.
    const surplus =
      snapshot.netIncome - essential - discretionary - snapshot.cashWithdrawals - debtPayments;
    state.liquid = (state.liquid + surplus) * (1 + savingsRate / 12);
    for (const loan of state.loans) {
      if (loan.remainingMonths <= 0) continue;
      loan.outstanding = amortizeOneMonth(loan.outstanding, loan.annualRate, loan.installment);
      loan.remainingMonths -= 1;
    }
  }

  const cash: PathResult = { monthsToReady: cashReadyMonth, timeline: cashTimeline };

  return {
    cash,
    rulesChecked: [
      { rule: growthRuleId(goal), valueUsed: growthRate, you: targetToday, effect: "sets_target" },
      {
        rule: "emergency_months_required",
        valueUsed: emergencyRequired,
        you: cashTimeline[0]?.emergencyMonths ?? 0,
        effect: (cashTimeline[0]?.emergencyMonths ?? 0) < emergencyRequired ? "blocks" : "passes",
      },
    ],
    rejectedOptions: [],
  };
}

// Changes are applied in task 5; until then the loop carries the state they will touch.
function applyChanges(_state: LoopState, _changes: Change[], _month: number): void {}

/** Discretionary spending after the active category caps; uncategorised spending is uncapped. */
export function discretionaryAfterCaps(snapshot: Snapshot, caps: Record<string, number>): number {
  let total = snapshot.discretionarySpending;
  for (const [category, cap] of Object.entries(caps)) {
    const spent = snapshot.discretionaryByCategory[category];
    if (spent === undefined) continue;
    total -= Math.max(0, spent - cap);
  }
  return Math.max(0, total);
}

export function growthRuleId(goal: Goal): "growth_property" | "growth_car" | "growth_wedding" {
  switch (goal.type) {
    case "house":
      return "growth_property";
    case "car":
      return "growth_car";
    case "wedding":
      return "growth_wedding";
  }
}

/** The amount the person must come up with today: the price, or the user's own figure, less
 *  the partner's and family's shares for a wedding. */
export function targetTodayOf(goal: Goal): number {
  const estimate = goal.estimate;
  if (!estimate) throw new Error("simulate: the goal has no estimate");
  const price = estimate.userOverride ?? estimate.targetToday;
  if (goal.type !== "wedding") return price;
  const inputs = goal.inputs as WeddingInputs;
  return Math.max(0, price - inputs.partnerShare - inputs.familyContribution);
}

/** The goal date as a "YYYY-MM" key: the wedding month, or December of the target year. */
export function goalDateOf(goal: Goal): string {
  if (goal.type === "wedding") return (goal.inputs as WeddingInputs).targetMonth;
  const { targetYear } = goal.inputs as { targetYear: number };
  return `${targetYear}-12`;
}
