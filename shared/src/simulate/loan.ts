import { type RuleId, type Rules, requireRule } from "../rules.js";
import type { CarInputs, Goal, HouseInputs, Profile } from "../types.js";
import { annuity } from "./money.js";

// The loan path of simulate() (specs/02-simulate.md, "Behavior" step 7): which DP rule
// applies, how long the loan may run, what the qualifying installment is and which rules fail
// in a given month. Pure functions over the rules table; nothing here is hard-coded.

export const HOUSE_PREFERRED_TENOR_YEARS = 20;

export interface LoanPlan {
  dpRuleId: RuleId;
  dpRatio: number;
  rateRuleId: "kpr_rate_fixed" | "kkb_rate";
  annualRate: number;
  /** The tenor the person asked for (or the default for the goal type). */
  preferredTenorYears: number;
  /** A product cap on the tenor (car loans), if any. */
  tenorCapRuleId?: "kkb_max_tenor_years";
  tenorCapYears?: number;
  loanEndAge: number;
  dtiCap: number;
  /** Income used for DTI: the applicant's, plus the spouse's only for a joint application. */
  income: number;
  jointApplication: boolean;
}

/** Decide the rules that apply to this goal's loan. Undefined for goals without a loan path. */
export function planLoan(goal: Goal, profile: Profile, rules: Rules): LoanPlan | undefined {
  if (goal.type === "wedding") return undefined;
  const loanEndAge = requireRule(rules, "loan_end_age");
  const dtiCap = requireRule(rules, "dti_cap");

  if (goal.type === "house") {
    const inputs = goal.inputs as HouseInputs;
    const dpRuleId: RuleId =
      inputs.firstHome && inputs.market === "new" ? "min_dp_first_home_new" : "min_dp_other_home";
    const jointApplication =
      inputs.joint === "joint" &&
      profile.maritalStatus === "married" &&
      (profile.spouseMonthlyIncome ?? 0) > 0;
    return {
      dpRuleId,
      dpRatio: requireRule(rules, dpRuleId),
      rateRuleId: "kpr_rate_fixed",
      annualRate: requireRule(rules, "kpr_rate_fixed"),
      preferredTenorYears: inputs.preferredTenorYears ?? HOUSE_PREFERRED_TENOR_YEARS,
      loanEndAge,
      dtiCap,
      income:
        profile.netMonthlyIncome + (jointApplication ? (profile.spouseMonthlyIncome ?? 0) : 0),
      jointApplication,
    };
  }

  const inputs = goal.inputs as CarInputs;
  const tenorCapYears = requireRule(rules, "kkb_max_tenor_years");
  return {
    dpRuleId: "min_dp_kkb",
    dpRatio: requireRule(rules, "min_dp_kkb"),
    rateRuleId: "kkb_rate",
    annualRate: requireRule(rules, "kkb_rate"),
    preferredTenorYears: inputs.preferredTenorYears ?? tenorCapYears,
    tenorCapRuleId: "kkb_max_tenor_years",
    tenorCapYears,
    loanEndAge,
    dtiCap,
    income: profile.netMonthlyIncome,
    jointApplication: false,
  };
}

/** Whole years the loan may run for someone of `age`: the preference, cut by the rules. */
export function allowedTenorYears(plan: LoanPlan, age: number): number {
  let years = Math.min(plan.preferredTenorYears, plan.loanEndAge - age);
  if (plan.tenorCapYears !== undefined) years = Math.min(years, plan.tenorCapYears);
  return Math.floor(years);
}

export interface LoanMonthInput {
  target: number;
  liquid: number;
  reserve: number; // emergencyRequired × essential
  emergencyMonths: number;
  emergencyRequired: number;
  debtPayments: number;
  age: number;
}

export interface LoanMonthCheck {
  dpNeeded: number;
  loanAmount: number;
  tenorYears?: number; // undefined when no tenor of at least a year is allowed
  installment?: number;
  dti?: number;
  failing: string[];
}

/** Check one month against the lending rules. The order of `failing` is stable. */
export function checkLoanMonth(plan: LoanPlan, m: LoanMonthInput): LoanMonthCheck {
  const dpNeeded = m.target * plan.dpRatio;
  const loanAmount = Math.max(0, m.target - dpNeeded);
  const failing: string[] = [];
  const tenorYears = allowedTenorYears(plan, m.age);

  let installment: number | undefined;
  let dti: number | undefined;
  if (tenorYears >= 1) {
    installment = annuity(loanAmount, plan.annualRate, tenorYears * 12);
    dti = (m.debtPayments + installment) / plan.income;
    if (dti > plan.dtiCap) failing.push("dti_cap");
  } else {
    failing.push("loan_end_age");
  }
  if (m.liquid - m.reserve < dpNeeded) failing.push(plan.dpRuleId);
  if (m.emergencyMonths < m.emergencyRequired) failing.push("emergency_months_required");

  return {
    dpNeeded,
    loanAmount,
    tenorYears: tenorYears >= 1 ? tenorYears : undefined,
    installment,
    dti,
    failing,
  };
}
