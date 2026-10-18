import type { Transaction } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { markRecurring } from "./recurring.js";

// specs/04-extraction.md task 5, recurring detection: same counterparty and similar amount in
// 2+ months, or known subscription merchants.

function txn(overrides: Partial<Transaction>): Transaction {
  return {
    id: "t",
    month: "2026-09",
    date: "2026-09-10",
    amount: 100_000,
    direction: "out",
    counterparty: "",
    rawDescription: "",
    sourceAccount: "BCA ****7890",
    sourceFileId: "f",
    cls: "discretionary",
    category: "other_spending",
    ...overrides,
  };
}

describe("markRecurring", () => {
  it("marks a counterparty seen with a similar amount in an earlier month", () => {
    const history = [
      txn({ id: "h1", month: "2026-08", counterparty: "PT SEWA RUMAH", amount: 3_000_000 }),
      txn({ id: "h2", month: "2026-07", counterparty: "GOJEK", amount: 25_000 }),
    ];
    const [rent, ride, shop] = markRecurring(
      [
        txn({ id: "rent", counterparty: "PT SEWA RUMAH", amount: 3_000_000 }),
        txn({ id: "ride", counterparty: "GOJEK", amount: 60_000 }),
        txn({ id: "shop", counterparty: "TOKOPEDIA", amount: 60_000 }),
      ],
      history,
    );
    expect(rent?.recurring).toBe(true);
    expect(ride?.recurring).toBe(false);
    expect(shop?.recurring).toBe(false);
  });

  it("allows ten percent of difference in the amount", () => {
    const history = [txn({ id: "h", month: "2026-08", counterparty: "PLN", amount: 400_000 })];
    expect(
      markRecurring([txn({ counterparty: "PLN", amount: 430_000 })], history)[0]?.recurring,
    ).toBe(true);
    expect(
      markRecurring([txn({ counterparty: "PLN", amount: 480_000 })], history)[0]?.recurring,
    ).toBe(false);
  });

  it("ignores history from the same month", () => {
    const history = [txn({ id: "h", month: "2026-09", counterparty: "PLN", amount: 400_000 })];
    expect(
      markRecurring([txn({ counterparty: "PLN", amount: 400_000 })], history)[0]?.recurring,
    ).toBe(false);
  });

  it("marks known subscription merchants and instalments without history", () => {
    const [netflix, subscription, installment, salary] = markRecurring([
      txn({ id: "n", counterparty: "NETFLIX", rawDescription: "NETFLIX.COM" }),
      txn({ id: "s", counterparty: "SOMETHING", category: "subscriptions" }),
      txn({ id: "i", counterparty: "SPAYLATER", cls: "debt_payment", category: "installment" }),
      txn({
        id: "g",
        direction: "in",
        cls: "income",
        category: "salary",
        counterparty: "PT MAJU JAYA",
      }),
    ]);
    expect(netflix?.recurring).toBe(true);
    expect(subscription?.recurring).toBe(true);
    expect(installment?.recurring).toBe(true);
    expect(salary?.recurring).toBe(false);
  });

  it("falls back to the description when the statement names no counterparty", () => {
    const history = [
      txn({
        id: "h",
        month: "2026-08",
        rawDescription: "AUTODEBET ASURANSI JIWA 0812",
        amount: 500_000,
      }),
    ];
    expect(
      markRecurring(
        [txn({ rawDescription: "AUTODEBET ASURANSI JIWA 0912", amount: 500_000 })],
        history,
      )[0]?.recurring,
    ).toBe(true);
  });
});
