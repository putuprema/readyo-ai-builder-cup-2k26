import type { Holding, Loan, Transaction } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import type { ExpectedFile } from "../fixtures.js";
import { formatTable, overallRowAccuracy, scoreFixture } from "./compare.js";

// specs/04-extraction.md task 6: the scoring behind the accuracy table, checked on hand-made
// data so the thresholds mean what the spec says.

function txn(overrides: Partial<Transaction> & { id: string }): Transaction {
  return {
    month: "2026-09",
    date: "2026-09-10",
    amount: 100_000,
    direction: "out",
    counterparty: "",
    rawDescription: "",
    sourceAccount: "BCA ****7890",
    sourceFileId: "f",
    ...overrides,
  };
}

const bankExpected: ExpectedFile = {
  kind: "bank",
  month: "2026-09",
  transactions: [
    { date: "2026-09-01", amount: 15_000_000, direction: "in", cls: "income" },
    { date: "2026-09-02", amount: 500_000, direction: "out", cls: "own_transfer" },
    { date: "2026-09-03", amount: 42_000, direction: "out" },
    { date: "2026-09-04", amount: 42_000, direction: "out" },
  ],
  loans: [],
  holdings: [],
};

describe("scoreFixture for transactions", () => {
  it("passes a perfect extraction", () => {
    const score = scoreFixture("bca", bankExpected, {
      transactions: [
        txn({ id: "a", date: "2026-09-01", amount: 15_000_000, direction: "in", cls: "income" }),
        txn({ id: "b", date: "2026-09-02", amount: 500_000, cls: "own_transfer" }),
        txn({ id: "c", date: "2026-09-03", amount: 42_000, cls: "essential" }),
        txn({ id: "d", date: "2026-09-04", amount: 42_000, cls: "essential" }),
      ],
      loans: [],
      holdings: [],
    });
    expect(score.pass).toBe(true);
    expect(score.rows).toMatchObject({
      expected: 4,
      extracted: 4,
      matched: 4,
      correct: 4,
      accuracy: 1,
    });
    expect(score.classes).toMatchObject({ labelled: 2, correct: 2, accuracy: 1 });
  });

  it("pairs equal amounts by the closest date so swapped rows still score", () => {
    const score = scoreFixture("bca", bankExpected, {
      transactions: [
        txn({ id: "a", date: "2026-09-01", amount: 15_000_000, direction: "in" }),
        txn({ id: "b", date: "2026-09-02", amount: 500_000 }),
        txn({ id: "d", date: "2026-09-04", amount: 42_000 }),
        txn({ id: "c", date: "2026-09-03", amount: 42_000 }),
      ],
      loans: [],
      holdings: [],
    });
    expect(score.rows.correct).toBe(4);
  });

  it("counts a wrong date or direction as an incorrect row and fails below 95%", () => {
    const score = scoreFixture("bca", bankExpected, {
      transactions: [
        txn({ id: "a", date: "2026-09-01", amount: 15_000_000, direction: "out" }),
        txn({ id: "b", date: "2026-09-20", amount: 500_000 }),
        txn({ id: "c", date: "2026-09-03", amount: 42_000 }),
      ],
      loans: [],
      holdings: [],
    });
    expect(score.rows).toMatchObject({
      matched: 3,
      correct: 1,
      dateCorrect: 2,
      directionCorrect: 2,
    });
    expect(score.rows.accuracy).toBe(0.25);
    expect(score.pass).toBe(false);
    expect(score.failures).toEqual(["row accuracy 25.0% below 95.0%"]);
  });

  it("fails when more rows were extracted than expected", () => {
    const score = scoreFixture("bca", bankExpected, {
      transactions: [
        ...bankExpected.transactions.map((r, i) => txn({ id: `r${i}`, ...r })),
        txn({ id: "extra", amount: 1 }),
      ],
      loans: [],
      holdings: [],
    });
    expect(score.rows.invented).toBe(true);
    expect(score.failures).toEqual(["5 rows extracted, 4 expected"]);
  });

  it("scores classes only on labelled rows", () => {
    const score = scoreFixture("bca", bankExpected, {
      transactions: [
        txn({ id: "a", date: "2026-09-01", amount: 15_000_000, direction: "in", cls: "income" }),
        txn({ id: "b", date: "2026-09-02", amount: 500_000, cls: "discretionary" }),
      ],
      loans: [],
      holdings: [],
    });
    expect(score.classes).toMatchObject({ labelled: 2, matched: 2, correct: 1, accuracy: 0.5 });
  });
});

describe("scoreFixture for loans and holdings", () => {
  const loan = (overrides: Partial<Loan>): Loan => ({
    id: "l",
    month: "2026-09",
    lender: "SPayLater",
    type: "paylater",
    outstandingPrincipal: 12_400_000,
    monthlyInstallment: 2_100_000,
    effectiveAnnualRate: 0.354,
    remainingTenorMonths: 6,
    sourceFileId: "f",
    ...overrides,
  });
  const loanExpected: ExpectedFile = {
    kind: "paylater",
    month: "2026-09",
    transactions: [],
    loans: [{ outstandingPrincipal: 12_400_000, monthlyInstallment: 2_100_000 }],
    holdings: [],
  };

  it("requires exactly one loan with matching outstanding and instalment", () => {
    expect(
      scoreFixture("pl", loanExpected, { transactions: [], loans: [loan({})], holdings: [] }).pass,
    ).toBe(true);
    const wrong = scoreFixture("pl", loanExpected, {
      transactions: [],
      loans: [loan({ monthlyInstallment: 2_000_000 })],
      holdings: [],
    });
    expect(wrong.failures).toEqual(["loan outstanding or instalment differs"]);
    const two = scoreFixture("pl", loanExpected, {
      transactions: [],
      loans: [loan({}), loan({ id: "l2" })],
      holdings: [],
    });
    expect(two.failures).toEqual(["2 loans, expected exactly 1"]);
  });

  const holding = (overrides: Partial<Holding>): Holding => ({
    id: "h",
    month: "2026-09",
    instrument: "BTC",
    provider: "Pluang",
    currentValue: 8_000_000,
    liquidityClass: "liquid",
    volatile: true,
    sourceFileId: "f",
    ...overrides,
  });
  const holdingExpected: ExpectedFile = {
    kind: "investment",
    month: "2026-09",
    transactions: [],
    loans: [],
    holdings: [
      { instrument: "BTC", currentValue: 8_000_000, volatile: true },
      { instrument: "Sucorinvest Money Market", currentValue: 20_000_000, volatile: false },
    ],
  };

  it("finds holdings by name (case-insensitive, partial) and checks value and volatile flag", () => {
    const good = scoreFixture("inv", holdingExpected, {
      transactions: [],
      loans: [],
      holdings: [
        holding({}),
        holding({
          id: "h2",
          instrument: "Sucorinvest Money Market Fund",
          currentValue: 20_000_000,
          volatile: false,
        }),
      ],
    });
    expect(good.pass).toBe(true);
    expect(good.holdings).toEqual({
      expected: 2,
      extracted: 2,
      found: 2,
      valueCorrect: 2,
      volatileCorrect: 2,
    });

    const bad = scoreFixture("inv", holdingExpected, {
      transactions: [],
      loans: [],
      holdings: [holding({ volatile: false }), holding({ id: "h3", instrument: "ETH" })],
    });
    expect(bad.failures).toEqual(["1 holding(s) missing", "volatile flag differs"]);
  });
});

describe("scoreFixture for foreign-currency holdings", () => {
  const usdExpected: ExpectedFile = {
    kind: "investment",
    month: "2026-07",
    transactions: [],
    loans: [],
    holdings: [{ instrument: "NVDA", currency: "USD", nativeValue: 4378.76, volatile: true }],
  };
  const nvda = (overrides: Partial<Holding>): Holding => ({
    id: "h",
    month: "2026-07",
    instrument: "NVDA",
    provider: "GoTrade",
    currentValue: 72_249_540,
    currency: "USD",
    nativeValue: 4378.76,
    liquidityClass: "liquid",
    volatile: true,
    sourceFileId: "f",
    ...overrides,
  });

  it("compares the printed value and currency, not the converted rupiah", () => {
    expect(
      scoreFixture("usd", usdExpected, {
        transactions: [],
        loans: [],
        holdings: [nvda({ currentValue: 1 })],
      }).pass,
    ).toBe(true);
    expect(
      scoreFixture("usd", usdExpected, {
        transactions: [],
        loans: [],
        holdings: [nvda({ nativeValue: 4378.7 })],
      }).failures,
    ).toEqual(["holding value differs"]);
    expect(
      scoreFixture("usd", usdExpected, {
        transactions: [],
        loans: [],
        holdings: [nvda({ currency: undefined, nativeValue: undefined })],
      }).failures,
    ).toEqual(["holding value differs"]);
  });
});

describe("formatTable and overallRowAccuracy", () => {
  it("prints one line per fixture and weights the overall figure by rows", () => {
    const a = scoreFixture("a", bankExpected, {
      transactions: bankExpected.transactions.map((r, i) => txn({ id: `r${i}`, ...r })),
      loans: [],
      holdings: [],
    });
    const b = scoreFixture("b", bankExpected, { transactions: [], loans: [], holdings: [] });
    const table = formatTable([a, b]);
    expect(table.split("\n")).toHaveLength(4);
    expect(table).toContain("4/4 (100.0%)");
    expect(table).toContain("FAIL: row accuracy 0.0% below 95.0%");
    expect(overallRowAccuracy([a, b])).toBe(0.5);
  });
});
