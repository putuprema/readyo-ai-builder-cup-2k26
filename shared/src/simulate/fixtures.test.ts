import { describe, expect, it } from "vitest";
import { RULE_IDS } from "../rules.js";
import type { Loan } from "../types.js";
import { type FixtureName, loadProfile, loadTestRulesFile } from "./fixtures.test-helper.js";

const names: FixtureName[] = ["house-a", "car-b", "wedding-c", "freelancer-d"];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const surplus = (f: ReturnType<typeof loadProfile>) => {
  const s = f.snapshot;
  return (
    s.netIncome - s.essentialSpending - s.discretionarySpending - s.cashWithdrawals - s.debtPayments
  );
};

describe("fixtures/profiles", () => {
  it.each(names)("%s is internally consistent", (name) => {
    const f = loadProfile(name);
    const s = f.snapshot;
    expect(sum(Object.values(s.discretionaryByCategory))).toBe(s.discretionarySpending);
    expect(sum(s.loans.map((l: Loan) => l.monthlyInstallment))).toBe(s.debtPayments);
    expect(f.profile.netMonthlyIncome).toBe(s.netIncome);
    expect(f.goal.estimate).toBeDefined();
    for (const l of s.loans) expect(l.month).toBe(s.month);
  });

  it("House-A matches the spec", () => {
    const f = loadProfile("house-a");
    const s = f.snapshot;
    expect(s.netIncome).toBe(18_000_000);
    expect(s.essentialSpending).toBe(8_000_000);
    expect(s.discretionarySpending).toBe(5_000_000);
    expect(s.discretionaryByCategory.food_delivery).toBe(1_400_000);
    expect(s.cashWithdrawals).toBe(500_000);
    expect(s.loans).toHaveLength(1);
    expect(s.loans[0]).toMatchObject({
      type: "paylater",
      outstandingPrincipal: 12_400_000,
      monthlyInstallment: 2_100_000,
      effectiveAnnualRate: 0.31,
      remainingTenorMonths: 8,
    });
    expect(s.liquidAssets).toBe(4_000_000);
    expect(s.volatileAssets).toBe(15_000_000);
    expect(f.profile).toMatchObject({ age: 35, employment: "permanent", maritalStatus: "single" });
    expect(f.goal.type).toBe("house");
    expect(f.goal.payPreference).toBe("loan");
    expect(f.goal.inputs).toMatchObject({ market: "new", firstHome: true });
    expect(f.goal.estimate?.targetToday).toBe(800_000_000);
    expect(f.goal.estimate?.growthRatePerYear).toBe(0.06);
    expect(surplus(f)).toBe(2_400_000);
  });

  it("the other profiles cover a car loan, a cash wedding and a freelancer", () => {
    expect(loadProfile("car-b").goal.type).toBe("car");
    const wedding = loadProfile("wedding-c");
    expect(wedding.goal.type).toBe("wedding");
    expect(wedding.goal.payPreference).toBe("none");
    expect(loadProfile("freelancer-d").profile.employment).toBe("freelance");
  });
});

describe("fixtures/profiles/rules-test.json", () => {
  it("names its placeholders and marks itself test-only", () => {
    const file = loadTestRulesFile();
    expect(file.note).toMatch(/TEST-ONLY/);
    expect(file.placeholders).toEqual(
      expect.arrayContaining(["min_dp_other_home", "min_dp_kkb", "kkb_rate"]),
    );
    for (const id of file.placeholders) expect(RULE_IDS).toContain(id);
    expect(Object.keys(file.rules).sort()).toEqual([...RULE_IDS].sort());
  });
});
