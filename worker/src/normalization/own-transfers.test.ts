import type { Transaction } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { looksLikeOwnTransfer, markOwnTransfers } from "./own-transfers.js";

// specs/04-extraction.md task 4, own-account transfers. Acceptance criterion: a BCA -> GoPay
// top-up has both legs classified own_transfer.

let seq = 0;
function txn(overrides: Partial<Transaction>): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    month: "2026-09",
    date: "2026-09-10",
    amount: 500_000,
    direction: "out",
    counterparty: "",
    rawDescription: "",
    sourceAccount: "BCA ****7890",
    sourceFileId: "file_bank",
    ...overrides,
  };
}

const bankTopUp = () =>
  txn({
    id: "bank_out",
    direction: "out",
    counterparty: "GOPAY",
    rawDescription: "TRSF E-BANKING DB TOPUP GOPAY ****7890",
  });
const walletTopUp = () =>
  txn({
    id: "wallet_in",
    direction: "in",
    date: "2026-09-10",
    counterparty: "BCA",
    rawDescription: "Top Up via BCA",
    sourceAccount: "GoPay ****4567",
    sourceFileId: "file_wallet",
  });

describe("markOwnTransfers", () => {
  it("classifies both legs of a BCA -> GoPay top-up as own_transfer", () => {
    const result = markOwnTransfers([bankTopUp(), walletTopUp()]);
    expect(result.pairs).toEqual([["bank_out", "wallet_in"]]);
    expect(result.transactions.map((t) => t.cls)).toEqual(["own_transfer", "own_transfer"]);
    expect(result.transactions.map((t) => t.category)).toEqual(["own_transfer", "own_transfer"]);
  });

  it("matches legs up to two days apart but not further", () => {
    const near = markOwnTransfers([
      txn({ id: "o", direction: "out", date: "2026-09-10", rawDescription: "TRANSFER" }),
      txn({
        id: "i",
        direction: "in",
        date: "2026-09-12",
        rawDescription: "TRANSFER MASUK",
        sourceAccount: "Mandiri ****1111",
      }),
    ]);
    expect(near.pairs).toEqual([["o", "i"]]);

    const far = markOwnTransfers([
      txn({ id: "o", direction: "out", date: "2026-09-10", rawDescription: "TRANSFER" }),
      txn({
        id: "i",
        direction: "in",
        date: "2026-09-13",
        rawDescription: "TRANSFER MASUK",
        sourceAccount: "Mandiri ****1111",
      }),
    ]);
    expect(far.pairs).toEqual([]);
    expect(far.transactions.every((t) => t.cls === undefined)).toBe(true);
  });

  it("does not match legs of different amounts or within the same account", () => {
    const result = markOwnTransfers([
      txn({ id: "o", direction: "out", amount: 500_000, rawDescription: "TRANSFER" }),
      txn({
        id: "i_amount",
        direction: "in",
        amount: 499_000,
        rawDescription: "TRANSFER",
        sourceAccount: "Mandiri ****1111",
      }),
      txn({ id: "i_same", direction: "in", amount: 500_000, rawDescription: "REFUND" }),
    ]);
    expect(result.pairs).toEqual([]);
  });

  it("matches one-to-one, earliest first, and leaves the extra leg alone", () => {
    const result = markOwnTransfers([
      txn({ id: "o1", direction: "out", date: "2026-09-10", rawDescription: "TRF" }),
      txn({ id: "o2", direction: "out", date: "2026-09-11", rawDescription: "TRF" }),
      txn({
        id: "i1",
        direction: "in",
        date: "2026-09-10",
        rawDescription: "TRF IN",
        sourceAccount: "Mandiri ****1111",
      }),
    ]);
    expect(result.pairs).toEqual([["o1", "i1"]]);
    expect(result.transactions.find((t) => t.id === "o2")?.cls).toBeUndefined();
  });

  it("recognises a top-up or an investment transfer from the bank side alone", () => {
    const result = markOwnTransfers([
      bankTopUp(),
      txn({
        id: "bibit",
        direction: "out",
        amount: 2_000_000,
        counterparty: "BIBIT",
        rawDescription: "TRSF E-BANKING DB PT BIBIT TUMBUH BERSAMA",
      }),
      txn({
        id: "ovo",
        direction: "out",
        amount: 100_000,
        counterparty: "",
        rawDescription: "TOP UP OVO ****1234",
      }),
      txn({
        id: "grocery",
        direction: "out",
        amount: 350_000,
        counterparty: "SUPERINDO",
        rawDescription: "DB SUPERINDO BSD",
      }),
    ]);
    expect(result.pairs).toEqual([]);
    expect(result.byPattern.sort()).toEqual(["bank_out", "bibit", "ovo"]);
    expect(result.transactions.find((t) => t.id === "grocery")?.cls).toBeUndefined();
  });

  it("recognises the wallet side of a top-up alone", () => {
    const result = markOwnTransfers([walletTopUp()]);
    expect(result.byPattern).toEqual(["wallet_in"]);
  });

  it("never marks a salary credit or a merchant payment", () => {
    expect(
      looksLikeOwnTransfer(
        txn({ direction: "in", counterparty: "PT MAJU JAYA", rawDescription: "GAJI SEPT" }),
      ),
    ).toBe(false);
    expect(
      looksLikeOwnTransfer(
        txn({ direction: "out", counterparty: "TOKOPEDIA", rawDescription: "TOKOPEDIA ORDER" }),
      ),
    ).toBe(false);
    // Paying a merchant with GoPay is not a top-up.
    expect(
      looksLikeOwnTransfer(
        txn({
          direction: "out",
          counterparty: "GOPAY",
          rawDescription: "DB GOPAY MERCHANT KOPI KENANGAN",
        }),
      ),
    ).toBe(false);
  });

  it("returns new objects and leaves the input untouched", () => {
    const input = [bankTopUp(), walletTopUp()];
    markOwnTransfers(input);
    expect(input.every((t) => t.cls === undefined)).toBe(true);
  });
});
