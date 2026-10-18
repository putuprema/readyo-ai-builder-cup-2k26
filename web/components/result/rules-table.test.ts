import { demoAnalysis } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { alsoConsideredText, ruleRows } from "./rules-table";

describe("ruleRows over the demo analysis", () => {
  it("formats every rule the simulation checked, blocking rows marked", () => {
    const rows = ruleRows(demoAnalysis);
    expect(rows.map((r) => [r.label, r.valueUsed, r.you, r.effect, r.blocking])).toEqual([
      [
        "Property price growth",
        "6% / yr",
        "Rp 1.35 bn today",
        "Sets the price at your goal date",
        false,
      ],
      ["Emergency fund before applying", "3 months", "4.6 months", "Passes", false],
      ["Debt-to-income cap", "35%", "37%", "Blocks approval today", true],
      [
        "Minimum DP, first home, new build",
        "5%",
        "Rp 67.5 m needed",
        "Blocks approval today",
        true,
      ],
      ["Loan must end by age", "Age 55", "20-year tenor", "Passes", false],
      [
        "KPR rate (fixed period)",
        "6.5% / yr",
        "Rp 9.6 m / mo installment",
        "Sets the installment",
        false,
      ],
      [
        "FLPP income ceiling",
        "Rp 12 m / mo",
        "Rp 28 m / mo",
        "Subsidised KPR (FLPP) rejected",
        false,
      ],
    ]);
  });

  it("adds a row for a rejection whose rule is not in the table", () => {
    const withJoint = {
      ...demoAnalysis,
      rejectedOptions: [
        ...demoAnalysis.rejectedOptions,
        {
          option: "joint_application",
          rule: "marital_status",
          reason: "A joint application needs a spouse; the profile is single.",
        },
      ],
    };
    const last = ruleRows(withJoint).at(-1);
    expect(last).toEqual({
      rule: "marital_status",
      label: "Joint application",
      valueUsed: "—",
      you: "—",
      effect:
        "Applying jointly rejected: A joint application needs a spouse; the profile is single.",
      blocking: false,
    });
  });
});

describe("alsoConsideredText", () => {
  it("lists the rejected options with their reasons", () => {
    expect(alsoConsideredText(demoAnalysis)).toBe(
      "subsidised KPR (FLPP) (needs a monthly income of at most Rp 12,000,000).",
    );
  });
  it("says so when nothing was rejected", () => {
    expect(alsoConsideredText({ ...demoAnalysis, rejectedOptions: [] })).toMatch(/^nothing else/);
  });
});
