import { demoRuleDefaults } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { checkedDate, formatRuleValue, ruleGroups, usedForText } from "./model";

describe("ruleGroups", () => {
  const groups = ruleGroups(demoRuleDefaults);

  it("lists every rule once, in the page's groups", () => {
    expect(groups.map((g) => g.title)).toEqual([
      "Lending rules",
      "Prices and rates",
      "Savings returns",
      "Readiness checks",
    ]);
    const ids = groups.flatMap((g) => g.rows.map((r) => r.id));
    expect(ids.sort()).toEqual(demoRuleDefaults.map((r) => r.id).sort());
  });

  it("orders rows by the page, whatever order the collection returns", () => {
    const shuffled = [...demoRuleDefaults].sort((a, b) => b.id.localeCompare(a.id));
    const [lending] = ruleGroups(shuffled);
    expect(lending?.rows.slice(0, 3).map((r) => r.id)).toEqual([
      "dti_cap",
      "min_dp_first_home_new",
      "min_dp_other_home",
    ]);
  });

  it("puts the lending rules in the table and the rates in prices", () => {
    expect(groups[0]?.rows.map((r) => r.id)).toContain("dti_cap");
    expect(groups[1]?.rows.map((r) => r.id)).toContain("kpr_rate_fixed");
    expect(groups[2]?.rows.map((r) => r.id)).toContain("return_money_market");
  });

  it("formats a row with its value, use, source and checked date", () => {
    const dti = groups[0]?.rows.find((r) => r.id === "dti_cap");
    expect(dti).toMatchObject({
      label: "Debt-to-income cap",
      value: "35%",
      usedFor: "KPR and KKB",
      source: { title: "[bank criteria, to be checked]", url: null },
      checked: "18 Oct 2026",
    });
    const dp = groups[0]?.rows.find((r) => r.id === "min_dp_first_home_new");
    expect(dp?.source.url).toMatch(/^https:\/\/www\.bi\.go\.id\//);
  });

  it("shows a stored override next to the default, and drops one equal to it", () => {
    const [lending] = ruleGroups(demoRuleDefaults, [
      { ruleId: "dti_cap", value: 0.4, updatedAt: "2026-10-18T00:00:00Z" },
      { ruleId: "loan_end_age", value: 55, updatedAt: "2026-10-18T00:00:00Z" },
    ]);
    expect(lending?.rows.find((r) => r.id === "dti_cap")?.override).toBe("40%");
    expect(lending?.rows.find((r) => r.id === "loan_end_age")?.override).toBeUndefined();
  });

  it("lists an unknown rule under readiness instead of hiding it", () => {
    const groups = ruleGroups([
      {
        id: "new_rule",
        label: "A new rule",
        value: 2,
        unit: "months",
        usedFor: [],
        source: { title: "Our rule", url: "" },
        checkedAt: "2026-10-18",
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe("readiness");
  });
});

describe("formatting", () => {
  it("writes each unit", () => {
    expect(formatRuleValue("ratio", 0.05)).toBe("5%");
    expect(formatRuleValue("rate", 0.065)).toBe("6.5% / yr");
    expect(formatRuleValue("rate", 0.083)).toBe("8.3% / yr");
    expect(formatRuleValue("years", 55)).toBe("55 yrs");
    expect(formatRuleValue("months", 3)).toBe("3 mo");
    expect(formatRuleValue("rupiah", 12_000_000)).toBe("Rp 12 m");
  });

  it("writes what a rule is used for and when it was checked", () => {
    expect(usedForText(["kpr", "kkb", "cash"])).toBe("KPR, KKB and cash path");
    expect(usedForText(["house", "car", "wedding"])).toBe("House goal, car goal and wedding goal");
    expect(usedForText(["readiness"])).toBe("Readiness checks");
    expect(checkedDate("2026-10-18")).toBe("18 Oct 2026");
  });
});
