import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeRules, RULE_IDS, requireRule } from "./rules.js";
import { loadTestRules } from "./simulate/fixtures.test-helper.js";
import type { RuleValue } from "./types.js";

const defaults = JSON.parse(
  readFileSync(new URL("../rules/defaults.json", import.meta.url), "utf8"),
) as RuleValue[];

describe("shared/rules/defaults.json", () => {
  it("holds well-formed rule records with known ids", () => {
    expect(defaults.length).toBeGreaterThan(0);
    for (const rule of defaults) {
      expect(RULE_IDS).toContain(rule.id);
      expect(typeof rule.value).toBe("number");
      expect(["ratio", "years", "months", "rupiah", "rate"]).toContain(rule.unit);
      expect(rule.usedFor.length).toBeGreaterThan(0);
      expect(rule.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(new Set(defaults.map((r) => r.id)).size).toBe(defaults.length);
  });

  it("carries the spec's defaults", () => {
    const m = mergeRules(defaults);
    expect(m.dti_cap).toBe(0.35);
    expect(m.min_dp_first_home_new).toBe(0.2);
    expect(m.loan_end_age).toBe(55);
    expect(m.emergency_months_required).toBe(3);
    expect(m.emergency_months_required_freelance).toBe(6);
    expect(m.flpp_income_ceiling).toBe(12_000_000);
    expect(m.flpp_income_ceiling_married).toBe(14_000_000);
    expect(m.kpr_rate_fixed).toBe(0.065);
    expect(m.kpr_rate_floating).toBe(0.11);
    expect(m.kpr_fixed_years).toBe(3);
    expect(m.growth_property).toBe(0.06);
    expect(m.return_money_market).toBe(0.045);
  });

  it("leaves the [__] values out until they are checked", () => {
    const m = mergeRules(defaults);
    for (const id of ["min_dp_other_home", "min_dp_kkb", "kkb_rate"]) {
      expect(m[id]).toBeUndefined();
    }
  });
});

describe("fixtures/profiles/rules-test.json", () => {
  it("is the defaults plus a value for every placeholder", () => {
    const test = loadTestRules();
    for (const rule of defaults) expect(test[rule.id]).toBe(rule.value);
    for (const id of RULE_IDS) expect(typeof test[id]).toBe("number");
  });
});

describe("mergeRules", () => {
  it("applies overrides on top of defaults without changing the defaults", () => {
    const before = JSON.stringify(defaults);
    const m = mergeRules(defaults, [
      { ruleId: "dti_cap", value: 0.4, updatedAt: "2026-10-18T00:00:00.000Z" },
    ]);
    expect(m.dti_cap).toBe(0.4);
    expect(m.loan_end_age).toBe(55);
    expect(JSON.stringify(defaults)).toBe(before);
  });

  it("accepts flat maps on both sides", () => {
    expect(mergeRules({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
  });
});

describe("requireRule", () => {
  it("returns the value when present and throws when missing", () => {
    expect(requireRule({ dti_cap: 0.35 }, "dti_cap")).toBe(0.35);
    expect(() => requireRule({}, "kkb_rate")).toThrow(/kkb_rate/);
  });
});
