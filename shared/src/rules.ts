import type { Override, RuleValue } from "./types.js";

// Rules and assumptions are data (specs/02-simulate.md, "Rules and assumptions"). Defaults
// live in the `rules` collection and in shared/rules/defaults.json; a user's overrides live in
// users/{uid}/overrides. simulate() receives the merged flat map and never a hard-coded value.

/** Every rule id simulate() may read. Ids marked [__] in the spec have no checked default yet. */
export const RULE_IDS = [
  "dti_cap",
  "min_dp_first_home_new",
  "min_dp_other_home",
  "loan_end_age",
  "flpp_income_ceiling",
  "min_dp_kkb",
  "kkb_max_tenor_years",
  "emergency_months_required",
  "emergency_months_required_freelance",
  "kpr_rate_fixed",
  "kpr_rate_floating",
  "kpr_fixed_years",
  "kkb_rate",
  "growth_property",
  "growth_car",
  "growth_wedding",
  "return_money_market",
] as const;

export type RuleId = (typeof RULE_IDS)[number];

export type Rules = Record<string, number>;

type OverrideInput = Rules | Override[] | Pick<Override, "ruleId" | "value">[];

/**
 * Merge rule defaults with a user's overrides into the flat map simulate() takes.
 * Overrides never change the defaults; an override for an unknown rule id is kept as is.
 */
export function mergeRules(defaults: RuleValue[] | Rules, overrides: OverrideInput = {}): Rules {
  const merged: Rules = {};
  if (Array.isArray(defaults)) {
    for (const rule of defaults) merged[rule.id] = rule.value;
  } else {
    Object.assign(merged, defaults);
  }
  if (Array.isArray(overrides)) {
    for (const o of overrides) merged[o.ruleId] = o.value;
  } else {
    Object.assign(merged, overrides);
  }
  return merged;
}

/** Read a rule the simulation needs; a missing rule is a data problem, never a guess. */
export function requireRule(rules: Rules, id: RuleId): number {
  const value = rules[id];
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`Rule "${id}" is missing from the merged rules`);
  }
  return value;
}
