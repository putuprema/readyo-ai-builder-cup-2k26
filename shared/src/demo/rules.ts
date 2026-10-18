import defaults from "../../rules/defaults.json" with { type: "json" };
import { mergeRules, type Rules } from "../rules.js";
import type { RuleValue } from "../types.js";

// The rules the demo analysis is simulated with: the checked defaults from
// shared/rules/defaults.json, nothing else. Every rule a first-home KPR reads has a checked
// default; fixtures/profiles/rules-test.json is test-only and never used here.

export const demoRuleDefaults: RuleValue[] = defaults as RuleValue[];

/** The merged flat map the demo analysis is simulated with. */
export const demoRules: Rules = mergeRules(demoRuleDefaults);
