import { type Rules, requireRule } from "../rules.js";
import type {
  Change,
  Goal,
  LoanPathResult,
  MonthState,
  PathResult,
  Profile,
  RuleEffect,
  SimulationResult,
  Snapshot,
  WeddingInputs,
} from "../types.js";
import { applyChanges } from "./changes.js";
import { checkLoanMonth, type LoanMonthCheck, planLoan } from "./loan.js";
import { amortizeOneMonth, grow, monthsBetween } from "./money.js";
import { rejectedOptionsFor } from "./options.js";

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

  const loanPlan = planLoan(goal, profile, rules);

  const cashTimeline: MonthState[] = [];
  let cashReadyMonth: number | null = null;
  const loanTimeline: MonthState[] = [];
  let loanReadyMonth: number | null = null;
  let loanCheckAtReady: LoanMonthCheck | undefined;
  let loanCheckAtStart: LoanMonthCheck | undefined;

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

    const base: MonthState = {
      month: m,
      liquid: Math.round(state.liquid),
      volatile: Math.round(state.volatile),
      debtPayments: Math.round(debtPayments),
      target: Math.round(target),
      emergencyMonths,
      failing: cashFailing,
    };
    cashTimeline.push(base);

    // Loan path (house, car): DP, tenor, installment and DTI against the lending rules.
    if (loanPlan) {
      const check = checkLoanMonth(loanPlan, {
        target,
        liquid: state.liquid,
        reserve,
        emergencyMonths,
        emergencyRequired,
        debtPayments,
        age: profile.age + Math.floor(m / 12),
      });
      if (m === 0) loanCheckAtStart = check;
      if (check.failing.length === 0 && loanReadyMonth === null) {
        loanReadyMonth = m;
        loanCheckAtReady = check;
      }
      loanTimeline.push({
        ...base,
        dpNeeded: Math.round(check.dpNeeded),
        installment: check.installment === undefined ? undefined : Math.round(check.installment),
        dti: check.dti,
        failing: check.failing,
      });
    }

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
  const month0 = cashTimeline[0];
  const emergencyAtStart = month0?.emergencyMonths ?? 0;

  const rulesChecked: SimulationResult["rulesChecked"] = [
    { rule: growthRuleId(goal), valueUsed: growthRate, you: targetToday, effect: "sets_target" },
    {
      rule: "emergency_months_required",
      valueUsed: emergencyRequired,
      you: emergencyAtStart,
      effect: emergencyAtStart < emergencyRequired ? "blocks" : "passes",
    },
  ];

  const rejectedOptions = rejectedOptionsFor(goal, profile, loanPlan, rules);
  const rejects = (rule: string) => rejectedOptions.some((o) => o.rule === rule);

  let loan: LoanPathResult | undefined;
  if (loanPlan && loanCheckAtStart) {
    const start = loanCheckAtStart;
    const blockedBy: LoanPathResult["blockedBy"] = [];
    const reserve = emergencyRequired * essential;
    const ageAtStart = profile.age;
    for (const rule of start.failing) {
      if (rule === "dti_cap") {
        blockedBy.push({ rule, value: start.dti ?? 0, limit: loanPlan.dtiCap });
      } else if (rule === "emergency_months_required") {
        blockedBy.push({ rule, value: emergencyAtStart, limit: emergencyRequired });
      } else if (rule === "loan_end_age") {
        blockedBy.push({ rule, value: ageAtStart, limit: loanPlan.loanEndAge });
      } else if (rule === loanPlan.dpRuleId) {
        blockedBy.push({
          rule,
          value: Math.max(0, Math.round(snapshot.liquidAssets - reserve)),
          limit: Math.round(start.dpNeeded),
        });
      }
    }
    loan = {
      monthsToReady: loanReadyMonth,
      timeline: loanTimeline,
      approvableToday: start.failing.length === 0,
      blockedBy,
      installmentAtApproval:
        loanCheckAtReady?.installment === undefined
          ? undefined
          : Math.round(loanCheckAtReady.installment),
      tenorYears: loanCheckAtReady?.tenorYears,
    };

    const passesOr = (blocked: boolean): RuleEffect => (blocked ? "blocks" : "passes");
    rulesChecked.push(
      {
        rule: "dti_cap",
        valueUsed: loanPlan.dtiCap,
        you: start.dti ?? "no tenor allowed",
        effect: passesOr(start.failing.includes("dti_cap")),
      },
      {
        rule: loanPlan.dpRuleId,
        valueUsed: loanPlan.dpRatio,
        you: Math.round(start.dpNeeded),
        effect: start.failing.includes(loanPlan.dpRuleId) ? "blocks" : "sets_target",
      },
      {
        rule: "loan_end_age",
        valueUsed: loanPlan.loanEndAge,
        you: start.tenorYears ?? 0,
        effect: start.failing.includes("loan_end_age")
          ? "blocks"
          : rejects("loan_end_age")
            ? "rejects_option"
            : "passes",
      },
      {
        rule: loanPlan.rateRuleId,
        valueUsed: loanPlan.annualRate,
        you: start.installment === undefined ? "no tenor allowed" : Math.round(start.installment),
        effect: "sets_target",
      },
    );
    if (loanPlan.tenorCapRuleId && loanPlan.tenorCapYears !== undefined) {
      rulesChecked.push({
        rule: loanPlan.tenorCapRuleId,
        valueUsed: loanPlan.tenorCapYears,
        you: start.tenorYears ?? 0,
        effect: rejects(loanPlan.tenorCapRuleId) ? "rejects_option" : "passes",
      });
    }
    if (goal.type === "house") {
      rulesChecked.push({
        rule: "flpp_income_ceiling",
        valueUsed: requireRule(rules, "flpp_income_ceiling"),
        you: profile.netMonthlyIncome,
        effect: rejects("flpp_income_ceiling") ? "rejects_option" : "passes",
      });
    }
  }

  return {
    cash,
    ...(loan ? { loan } : {}),
    rulesChecked,
    rejectedOptions,
  };
}

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
