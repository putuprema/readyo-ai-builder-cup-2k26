import type { Transaction } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { dedupTransactions } from "./dedup.js";

// specs/04-extraction.md task 4, dedup: same date, amount and counterparty within one source
// -> one transaction.

function txn(overrides: Partial<Transaction> & { id: string }): Transaction {
  return {
    month: "2026-09",
    date: "2026-09-10",
    amount: 25_000,
    direction: "out",
    counterparty: "GOJEK",
    rawDescription: "GOJEK RIDE",
    sourceAccount: "BCA ****7890",
    sourceFileId: "file_a",
    ...overrides,
  };
}

describe("dedupTransactions", () => {
  it("removes the repeat of a row that appears in two files of the same account", () => {
    const a = txn({ id: "t1" });
    const b = txn({ id: "t2", sourceFileId: "file_b", rawDescription: "GOJEK RIDE (page 2)" });
    const result = dedupTransactions([a, b]);
    expect(result.kept.map((t) => t.id)).toEqual(["t1"]);
    expect(result.removed.map((t) => t.id)).toEqual(["t2"]);
  });

  it("keeps identical rows that come from the same file", () => {
    const result = dedupTransactions([txn({ id: "t1" }), txn({ id: "t2" })]);
    expect(result.kept).toHaveLength(2);
    expect(result.removed).toEqual([]);
  });

  it("keeps rows that differ in account, date, amount, direction or counterparty", () => {
    const base = txn({ id: "t0" });
    const variants = [
      txn({ id: "acct", sourceFileId: "file_b", sourceAccount: "GoPay ****4567" }),
      txn({ id: "date", sourceFileId: "file_b", date: "2026-09-11" }),
      txn({ id: "amount", sourceFileId: "file_b", amount: 26_000 }),
      txn({ id: "dir", sourceFileId: "file_b", direction: "in" }),
      txn({ id: "cp", sourceFileId: "file_b", counterparty: "GRAB" }),
    ];
    const result = dedupTransactions([base, ...variants]);
    expect(result.kept).toHaveLength(6);
  });

  it("matches counterparty and account case- and space-insensitively", () => {
    const a = txn({ id: "t1", counterparty: "Gojek  Indonesia" });
    const b = txn({
      id: "t2",
      sourceFileId: "file_b",
      counterparty: "GOJEK INDONESIA",
      sourceAccount: "bca ****7890",
    });
    expect(dedupTransactions([a, b]).removed.map((t) => t.id)).toEqual(["t2"]);
  });

  it("keeps the first occurrence and drops every later repeat", () => {
    const rows = ["file_a", "file_b", "file_c"].map((f, i) =>
      txn({ id: `t${i}`, sourceFileId: f }),
    );
    const result = dedupTransactions(rows);
    expect(result.kept.map((t) => t.id)).toEqual(["t0"]);
    expect(result.removed.map((t) => t.id)).toEqual(["t1", "t2"]);
  });
});
