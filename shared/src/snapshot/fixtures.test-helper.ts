import type { Holding, Loan, Profile, Transaction, TransactionClass } from "../types.js";

// Hand-written records for the snapshot tests. Test-only (see tsconfig.json). The month is
// September 2026, the same as the House-A fixture, and the figures are chosen so the sums are
// easy to check by hand.

export const MONTH = "2026-09";

export const employee: Profile = {
  age: 35,
  employment: "permanent",
  netMonthlyIncome: 18_000_000,
  maritalStatus: "single",
  dependents: 0,
  city: "Tangerang Selatan",
};

export const freelancer: Profile = { ...employee, employment: "freelance", netMonthlyIncome: 0 };

let seq = 0;

export function txn(
  cls: TransactionClass | undefined,
  amount: number,
  direction: "in" | "out",
  extra: Partial<Transaction> = {},
): Transaction {
  seq += 1;
  return {
    id: `txn_${seq}`,
    month: MONTH,
    date: `${MONTH}-${String(Math.min(28, seq)).padStart(2, "0")}`,
    amount,
    direction,
    counterparty: extra.counterparty ?? `counterparty ${seq}`,
    rawDescription: extra.rawDescription ?? `row ${seq}`,
    sourceAccount: extra.sourceAccount ?? "Bank ****1234",
    sourceFileId: extra.sourceFileId ?? "doc-bank",
    ...(cls ? { cls } : {}),
    ...extra,
  };
}

/** A bank month: salary, rent, groceries, two deliveries, shopping, an ATM withdrawal, a
 *  PayLater payment, a GoPay top-up (own transfer, both legs) and a Bibit transfer. */
export function bankAndWalletMonth(): Transaction[] {
  return [
    txn("income", 18_500_000, "in", { counterparty: "PT Maju Jaya", category: "salary" }),
    txn("essential", 4_000_000, "out", { counterparty: "Kos Pak Budi", category: "rent" }),
    txn("essential", 1_500_000, "out", { counterparty: "Superindo", category: "groceries" }),
    txn("essential", 500_000, "out", { counterparty: "PLN", category: "utilities" }),
    txn("discretionary", 800_000, "out", { counterparty: "GoFood", category: "food_delivery" }),
    txn("discretionary", 600_000, "out", { counterparty: "GrabFood", category: "food_delivery" }),
    txn("discretionary", 1_600_000, "out", { counterparty: "Tokopedia", category: "shopping" }),
    txn("discretionary", 200_000, "in", { counterparty: "Tokopedia", category: "shopping" }), // refund
    txn("cash", 500_000, "out", { counterparty: "ATM BCA", category: "cash" }),
    txn("debt_payment", 2_100_000, "out", { counterparty: "Kredivo", category: "installment" }),
    // BCA → GoPay top-up: both legs own transfers.
    txn("own_transfer", 1_000_000, "out", { counterparty: "GoPay top-up" }),
    txn("own_transfer", 1_000_000, "in", {
      counterparty: "Top-up from BCA",
      sourceAccount: "GoPay ****4567",
      sourceFileId: "doc-gopay",
    }),
    // Salary moved to Bibit: an own transfer, not spending and not income.
    txn("own_transfer", 3_000_000, "out", { counterparty: "Bibit" }),
    // E-wallet spending.
    txn("discretionary", 250_000, "out", {
      counterparty: "Netflix",
      category: "subscriptions",
      sourceAccount: "GoPay ****4567",
      sourceFileId: "doc-gopay",
    }),
  ];
}

export const paylaterLoan: Loan = {
  id: "loan_kredivo",
  month: MONTH,
  lender: "Kredivo",
  type: "paylater",
  outstandingPrincipal: 12_400_000,
  monthlyInstallment: 2_100_000,
  effectiveAnnualRate: 0.31,
  remainingTenorMonths: 8,
  sourceFileId: "doc-paylater",
};

export const paidOffLoan: Loan = {
  ...paylaterLoan,
  id: "loan_paid",
  lender: "Akulaku",
  outstandingPrincipal: 0,
  monthlyInstallment: 400_000,
  remainingTenorMonths: 0,
};

export function holding(
  instrument: string,
  currentValue: number,
  liquidityClass: Holding["liquidityClass"],
  volatile: boolean,
): Holding {
  seq += 1;
  return {
    id: `hold_${seq}`,
    month: MONTH,
    instrument,
    provider: "Bibit",
    currentValue,
    liquidityClass,
    volatile,
    sourceFileId: "doc-bibit",
  };
}

export function portfolio(): Holding[] {
  return [
    holding("Money-market fund", 3_000_000, "liquid", false),
    holding("Cash balance", 1_000_000, "cash", false),
    holding("Time deposit (6 months)", 5_000_000, "locked", false),
    holding("Equity fund", 7_000_000, "liquid", true),
    holding("Bitcoin", 8_000_000, "liquid", true),
  ];
}
