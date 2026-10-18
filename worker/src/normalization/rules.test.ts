import type { Transaction } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { applyRules } from "./rules.js";

// specs/04-extraction.md task 5: rules in code override the model where certain (salary credit
// -> income, ATM withdrawal -> cash, payment to a known PayLater -> debt_payment).

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
    ...overrides,
  };
}

describe("applyRules", () => {
  it.each([
    [
      "salary credit",
      txn({ direction: "in", rawDescription: "TRSF E-BANKING CR GAJI SEPT PT MAJU JAYA" }),
      "income",
      "salary",
      "salary",
    ],
    [
      "payroll credit",
      txn({ direction: "in", counterparty: "PAYROLL PT ABC" }),
      "income",
      "salary",
      "salary",
    ],
    [
      "interest",
      txn({ direction: "in", rawDescription: "BUNGA TABUNGAN" }),
      "income",
      "interest",
      "interest",
    ],
    [
      "ATM withdrawal",
      txn({ rawDescription: "TARIKAN ATM 10/09 BSD" }),
      "cash",
      "atm_withdrawal",
      "atm",
    ],
    [
      "cash withdrawal (English)",
      txn({ rawDescription: "ATM WITHDRAWAL" }),
      "cash",
      "atm_withdrawal",
      "atm",
    ],
    [
      "known PayLater",
      txn({ counterparty: "SPAYLATER", rawDescription: "PEMBAYARAN SPAYLATER" }),
      "debt_payment",
      "installment",
      "lender",
    ],
    [
      "Kredivo",
      txn({ rawDescription: "DB KREDIVO TAGIHAN" }),
      "debt_payment",
      "installment",
      "lender",
    ],
    [
      "instalment wording",
      txn({ rawDescription: "ANGSURAN KPR BULAN 9" }),
      "debt_payment",
      "installment",
      "installment",
    ],
    ["bank fee", txn({ rawDescription: "BIAYA ADM" }), "essential", "bank_fees", "bank_fee"],
    [
      "subscription",
      txn({ counterparty: "NETFLIX", rawDescription: "NETFLIX.COM" }),
      "discretionary",
      "subscriptions",
      "subscription",
    ],
    ["rent", txn({ rawDescription: "TRSF SEWA KOST OKT" }), "essential", "rent", "rent"],
    ["insurance", txn({ rawDescription: "BPJS KESEHATAN" }), "essential", "insurance", "insurance"],
    ["electricity", txn({ rawDescription: "PLN POSTPAID" }), "essential", "utilities", "utility"],
    [
      "e-wallet top-up",
      txn({ counterparty: "GOPAY", rawDescription: "TOPUP GOPAY ****7890" }),
      "own_transfer",
      "own_transfer",
      "own_transfer",
    ],
    [
      "investment app",
      txn({ counterparty: "BIBIT", rawDescription: "TRSF PT BIBIT TUMBUH BERSAMA" }),
      "own_transfer",
      "own_transfer",
      "own_transfer",
    ],
  ] as const)("%s", (_label, t, cls, category, rule) => {
    expect(applyRules(t)).toEqual({ cls, category, rule });
  });

  it("leaves uncertain rows to the model", () => {
    expect(
      applyRules(txn({ counterparty: "TOKOPEDIA", rawDescription: "TOKOPEDIA ORDER" })),
    ).toBeNull();
    expect(applyRules(txn({ counterparty: "GOJEK", rawDescription: "GOJEK RIDE" }))).toBeNull();
    expect(
      applyRules(
        txn({ direction: "in", counterparty: "BUDI", rawDescription: "TRANSFER DARI BUDI" }),
      ),
    ).toBeNull();
  });

  it("does not treat salary words on a debit as income, nor lender words on a credit as debt", () => {
    expect(applyRules(txn({ direction: "out", rawDescription: "TRSF GAJI ART" }))).toBeNull();
    expect(applyRules(txn({ direction: "in", rawDescription: "KREDIVO REFUND" }))).toBeNull();
  });

  it("prefers the own-transfer rule over the others", () => {
    // "TOPUP GOPAY" before anything else, even if the text also says something subscription-like.
    expect(applyRules(txn({ rawDescription: "TOPUP GOPAY UNTUK SPOTIFY" }))?.rule).toBe(
      "own_transfer",
    );
  });
});
