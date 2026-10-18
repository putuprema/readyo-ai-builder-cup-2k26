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

describe("buildSnapshot: carry-forward for missing sources", () => {
  const september = build({
    bankBalances: [10_000_000],
    sources: ["bank", "ewallet", "paylater", "investment"],
  });
  const octoberBank = bankAndWalletMonth().map((t) => ({
    ...t,
    month: "2026-10",
    date: t.date.replace("2026-09", "2026-10"),
  }));
  const october = (extra: Partial<Parameters<typeof buildSnapshot>[0]> = {}) =>
    buildSnapshot({
      month: "2026-10",
      transactions: octoberBank,
      loans: [],
      holdings: [],
      profile: employee,
      bankBalances: [12_000_000],
      sources: ["bank", "ewallet"],
      carriedFrom: {
        snapshot: september,
        sources: ["bank", "ewallet", "paylater", "investment"],
      },
      ...extra,
    });

  it("a month without the PayLater source reuses last month's loan and lists it", () => {
    const s = october({ sources: ["bank", "ewallet", "investment"] });
    expect(s.estimatedSources).toEqual(["paylater"]);
    expect(s.loans).toEqual([paylaterLoan]);
    expect(s.debtPayments).toBe(2_100_000);
    // This month's own records are still used.
    expect(s.bankBalances).toBe(12_000_000);
    expect(s.volatileAssets).toBe(0);
  });

  it("a missing investment source carries last month's holdings, not its bank balance", () => {
    const s = october({ sources: ["bank", "ewallet", "paylater"] });
    expect(s.estimatedSources).toEqual(["investment"]);
    expect(s.volatileAssets).toBe(15_000_000);
    expect(s.liquidAssets).toBe(12_000_000 + 4_000_000);
    expect(s.loans).toEqual([]);
  });

  it("a missing bank statement carries income, spending and balances", () => {
    const s = october({
      transactions: [],
      bankBalances: undefined,
      sources: ["paylater", "investment"],
      loans: [{ ...paylaterLoan, month: "2026-10", outstandingPrincipal: 10_500_000 }],
    });
    expect(s.estimatedSources).toEqual(["bank", "ewallet"]);
    expect(s.computedNetIncome).toBe(18_500_000);
    expect(s.essentialSpending).toBe(6_000_000);
    expect(s.discretionaryByCategory).toEqual(september.discretionaryByCategory);
    expect(s.bankBalances).toBe(10_000_000);
    expect(s.loans[0]?.outstandingPrincipal).toBe(10_500_000);
  });

  it("lists every missing kind in display order and carries each bucket", () => {
    const s = october({ transactions: [], bankBalances: undefined, sources: [] });
    expect(s.estimatedSources).toEqual(["bank", "ewallet", "paylater", "investment"]);
    expect(s).toMatchObject({
      netIncome: september.netIncome,
      essentialSpending: september.essentialSpending,
      debtPayments: september.debtPayments,
      liquidAssets: september.liquidAssets,
      volatileAssets: september.volatileAssets,
    });
    expect(s.month).toBe("2026-10");
  });

  it("carries nothing when every source is back, or when there is no previous month", () => {
    const all = october({ sources: ["bank", "ewallet", "paylater", "investment"] });
    expect(all.estimatedSources).toEqual([]);
    expect(all.loans).toEqual([]);
    expect(all.volatileAssets).toBe(0);
    expect(october({ carriedFrom: undefined, sources: [] }).estimatedSources).toEqual([]);
  });

  it("a kind last month never had is not estimated", () => {
    const s = october({
      sources: ["bank"],
      carriedFrom: { snapshot: september, sources: ["bank", "pinjol"] },
    });
    expect(s.estimatedSources).toEqual(["pinjol"]);
    expect(s.loans).toEqual([]); // last month had no pinjol loan to carry
  });
});
