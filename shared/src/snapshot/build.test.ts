import { describe, expect, it } from "vitest";
import { buildSnapshot, coefficientOfVariation } from "./build.js";
import {
  bankAndWalletMonth,
  employee,
  freelancer,
  MONTH,
  paidOffLoan,
  paylaterLoan,
  portfolio,
  txn,
} from "./fixtures.test-helper.js";

const build = (extra: Partial<Parameters<typeof buildSnapshot>[0]> = {}) =>
  buildSnapshot({
    month: MONTH,
    transactions: bankAndWalletMonth(),
    loans: [paylaterLoan, paidOffLoan],
    holdings: portfolio(),
    profile: employee,
    ...extra,
  });

describe("buildSnapshot: income and spending", () => {
  it("sums each class, with refunds subtracted and own transfers ignored", () => {
    const s = build();
    expect(s.month).toBe(MONTH);
    expect(s.computedNetIncome).toBe(18_500_000);
    expect(s.essentialSpending).toBe(6_000_000);
    // 800k + 600k + 1.6m − 200k refund + 250k Netflix on the e-wallet
    expect(s.discretionarySpending).toBe(3_050_000);
    expect(s.discretionaryByCategory).toEqual({
      food_delivery: 1_400_000,
      shopping: 1_400_000,
      subscriptions: 250_000,
    });
    expect(s.cashWithdrawals).toBe(500_000);
  });

  it("uses the income the user confirmed and keeps the computed one for display", () => {
    const s = build();
    expect(s.netIncome).toBe(18_000_000);
    expect(s.computedNetIncome).toBe(18_500_000);
  });

  it("falls back to the computed income when the profile has none", () => {
    const s = build({ profile: { ...employee, netMonthlyIncome: 0 } });
    expect(s.netIncome).toBe(18_500_000);
  });

  it("own-account transfers change neither income nor spending", () => {
    const withTransfers = build();
    const without = build({
      transactions: bankAndWalletMonth().filter((t) => t.cls !== "own_transfer"),
    });
    expect(withTransfers.netIncome).toBe(without.netIncome);
    expect(withTransfers.computedNetIncome).toBe(without.computedNetIncome);
    expect(withTransfers.essentialSpending).toBe(without.essentialSpending);
    expect(withTransfers.discretionarySpending).toBe(without.discretionarySpending);
    expect(withTransfers.cashWithdrawals).toBe(without.cashWithdrawals);
  });

  it("ignores rows from other months and rows without a class", () => {
    const s = build({
      transactions: [
        ...bankAndWalletMonth(),
        txn("income", 50_000_000, "in", { month: "2026-08", date: "2026-08-25" }),
        txn(undefined, 9_000_000, "out"),
      ],
    });
    expect(s.computedNetIncome).toBe(18_500_000);
    expect(s.discretionarySpending).toBe(3_050_000);
  });

  it("an investment buy inside an investment account is not spending", () => {
    const s = build({
      transactions: [...bankAndWalletMonth(), txn("investment", 2_000_000, "out")],
    });
    expect(s.discretionarySpending).toBe(3_050_000);
    expect(s.essentialSpending).toBe(6_000_000);
  });
});

describe("buildSnapshot: debts and assets", () => {
  it("takes debt payments from the active loans, not from the transactions", () => {
    const s = build();
    expect(s.debtPayments).toBe(2_100_000);
    expect(s.loans.map((l) => l.id)).toEqual(["loan_kredivo"]);
  });

  it("splits holdings into liquid (cash or liquid, not volatile) and volatile", () => {
    const s = build();
    expect(s.liquidAssets).toBe(4_000_000); // money-market + cash; the time deposit is locked
    expect(s.volatileAssets).toBe(15_000_000); // equity fund + bitcoin
    expect(s.bankBalances).toBeUndefined();
  });

  it("adds extracted bank balances to the liquid assets", () => {
    const s = build({ bankBalances: [9_830_000, 170_000] });
    expect(s.bankBalances).toBe(10_000_000);
    expect(s.liquidAssets).toBe(14_000_000);
  });

  it("starts with no estimated sources", () => {
    expect(build().estimatedSources).toEqual([]);
  });
});

describe("buildSnapshot: freelancer income variability", () => {
  it("is absent for employees and for a single month", () => {
    expect(build().incomeVariability).toBeUndefined();
    expect(build({ profile: freelancer }).incomeVariability).toBeUndefined();
  });

  it("is the std dev over the mean of the months available", () => {
    const s = build({ profile: freelancer, incomeHistory: [12_500_000, 15_000_000] });
    // series 12.5m, 15m, 18.5m: mean 15.33m; squared deviations 8.03, 0.11, 10.03 (m^2)
    const mean = (12.5 + 15 + 18.5) / 3;
    const stdDev = Math.sqrt(((12.5 - mean) ** 2 + (15 - mean) ** 2 + (18.5 - mean) ** 2) / 3);
    expect(s.incomeVariability).toBeCloseTo(stdDev / mean, 6);
    expect(s.incomeVariability).toBeCloseTo(0.1605, 3);
    expect(s.netIncome).toBe(18_500_000);
  });

  it("coefficientOfVariation handles edge cases", () => {
    expect(coefficientOfVariation([])).toBe(0);
    expect(coefficientOfVariation([0, 0])).toBe(0);
    expect(coefficientOfVariation([5, 5, 5])).toBe(0);
  });
});
