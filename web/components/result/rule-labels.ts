import type { RuleUnit, RuleValue } from "@adidi/shared";
import defaults from "@adidi/shared/rules/defaults.json";

// Labels and units for the rule ids the simulation reports (rulesChecked, rejectedOptions,
// blockedBy). The long labels come from the shared defaults; the short ones are the design's
// wording for the result page. Two rejection ids are not rules in the table
// (docs/progress.md, "Decisions still open"), so they are named here.

const RULES = defaults as RuleValue[];

const SHORT_LABELS: Record<string, string> = {
  dti_cap: "Debt-to-income cap",
  min_dp_first_home_new: "Minimum DP, first home, new build",
  min_dp_other_home: "Minimum DP, secondary or second home",
  min_dp_kkb: "Minimum DP, car loan",
  loan_end_age: "Loan must end by age",
  emergency_months_required: "Emergency fund before applying",
  emergency_months_required_freelance: "Emergency fund before applying (freelance)",
  flpp_income_ceiling: "FLPP income ceiling",
  flpp_income_ceiling_married: "FLPP income ceiling (married)",
  kpr_rate_fixed: "KPR rate (fixed period)",
  kpr_rate_floating: "KPR rate (after the fixed period)",
  kpr_fixed_years: "KPR fixed-rate period",
  kkb_rate: "Car loan rate",
  kkb_max_tenor_years: "Longest car loan",
  growth_property: "Property price growth",
  growth_car: "Car price growth",
  growth_wedding: "Wedding cost growth",
  return_money_market: "Money-market return",
  marital_status: "Joint application",
  flpp_first_home_only: "FLPP first-home rule",
};

export function ruleLabel(ruleId: string): string {
  return (
    SHORT_LABELS[ruleId] ?? RULES.find((r) => r.id === ruleId)?.label ?? ruleId.replaceAll("_", " ")
  );
}

export function ruleUnit(ruleId: string): RuleUnit | undefined {
  return RULES.find((r) => r.id === ruleId)?.unit;
}

/** The option names the simulator reports in rejectedOptions, in plain words. */
export function optionLabel(option: string): string {
  if (option === "flpp") return "subsidised KPR (FLPP)";
  if (option === "joint_application") return "applying jointly";
  const tenor = /^tenor_(\d+)y$/.exec(option);
  if (tenor) return `a ${tenor[1]}-year tenor`;
  return option.replaceAll("_", " ");
}
