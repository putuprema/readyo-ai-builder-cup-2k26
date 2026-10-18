import defaults from "../../rules/defaults.json" with { type: "json" };
import { mergeRules, type Rules } from "../rules.js";
import type { RuleValue } from "../types.js";

// The rules the demo analysis is simulated with: the checked defaults from
// shared/rules/defaults.json plus a placeholder for the one [__] rule a first-home KPR reads.
// The placeholder is demo data like every other number in this folder (specs/02-simulate.md:
// defaults.json leaves the [__] rules out on purpose, and fixtures/profiles/rules-test.json is
// test-only and never seeded). Any value below the demo income gives the same simulation; only
// the "See the rules used" panel shows the number. Replace it when the checked value lands in
// defaults.json, and this map becomes empty.

export const demoRuleDefaults: RuleValue[] = defaults as RuleValue[];

/** Placeholders for the [__] rules the demo goal needs. Not checked against any source. */
export const DEMO_RULE_PLACEHOLDERS: Rules = {
  flpp_income_ceiling: 8_000_000,
};

/** The merged flat map the demo analysis is simulated with. */
export const demoRules: Rules = mergeRules(demoRuleDefaults, DEMO_RULE_PLACEHOLDERS);
