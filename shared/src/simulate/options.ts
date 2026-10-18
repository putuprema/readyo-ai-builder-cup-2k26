import { type Rules, requireRule } from "../rules.js";
import type { Goal, HouseInputs, Profile, SimulationResult } from "../types.js";
import type { LoanPlan } from "./loan.js";

// Options the simulator considered and rejected, with the rule that rejects them
// (specs/02-simulate.md, "Behavior" step 8). They feed the "Also considered" card and the
// "See the rules used" panel. Evaluated at month 0.

export type RejectedOption = SimulationResult["rejectedOptions"][number];

export const FLPP_FIRST_HOME_RULE = "flpp_first_home_only";
export const MARITAL_STATUS_RULE = "marital_status";

export function rejectedOptionsFor(
  goal: Goal,
  profile: Profile,
  plan: LoanPlan | undefined,
  rules: Rules,
): RejectedOption[] {
  if (!plan) return [];
  const rejected: RejectedOption[] = [];

  if (goal.type === "house") {
    const inputs = goal.inputs as HouseInputs;
    if (inputs.joint === "joint" && !plan.jointApplication) {
      rejected.push({
        option: "joint_application",
        rule: MARITAL_STATUS_RULE,
        reason:
          profile.maritalStatus === "single"
            ? "A joint application needs a spouse; the profile is single."
            : "A joint application needs a spouse income; none is recorded.",
      });
    }
    const ceiling = requireRule(rules, "flpp_income_ceiling");
    if (!inputs.firstHome) {
      rejected.push({
        option: "flpp",
        rule: FLPP_FIRST_HOME_RULE,
        reason: "Subsidised KPR (FLPP) is for a first home only.",
      });
    } else if (profile.netMonthlyIncome > ceiling) {
      rejected.push({
        option: "flpp",
        rule: "flpp_income_ceiling",
        reason: `Subsidised KPR (FLPP) needs a monthly income of at most Rp ${ceiling.toLocaleString("en-US")}.`,
      });
    }
  }

  const byAge = plan.loanEndAge - profile.age;
  if (plan.preferredTenorYears > byAge) {
    rejected.push({
      option: `tenor_${plan.preferredTenorYears}y`,
      rule: "loan_end_age",
      reason: `A ${plan.preferredTenorYears}-year loan would end after age ${plan.loanEndAge}; the longest allowed is ${Math.max(0, Math.floor(byAge))} years.`,
    });
  }
  if (plan.tenorCapYears !== undefined && plan.preferredTenorYears > plan.tenorCapYears) {
    rejected.push({
      option: `tenor_${plan.preferredTenorYears}y`,
      rule: plan.tenorCapRuleId ?? "kkb_max_tenor_years",
      reason: `Car loans run at most ${plan.tenorCapYears} years.`,
    });
  }
  return rejected;
}
