import type { Holding, Loan, Profile, Snapshot, Transaction } from "../types.js";

// Stage 4, the financial profile (specs/03-snapshot-metrics.md, "Snapshot"): one month of
// normalized transactions, loans and holdings folded into a Snapshot. Pure: no I/O, no clock.
// Every figure is an integer number of rupiah, so the sums need no rounding.

export interface BuildSnapshotInput {
  /** The month the snapshot describes, "YYYY-MM". Records from other months are ignored. */
  month: string;
  transactions: Transaction[];
  loans: Loan[];
  holdings: Holding[];
  profile: Profile;
  /** Closing balances of the bank and e-wallet accounts read this month, when the statements showed one. */
  bankBalances?: number[];
  /** Computed net income of earlier months, oldest first, for the freelancer variability figure. */
  incomeHistory?: number[];
}

/** Sum of a class's spending this month: debits add, credits (refunds) subtract. */
function signed(t: Transaction): number {
  return t.direction === "out" ? t.amount : -t.amount;
}

/** Is a loan still being paid? A paid-off bill (nothing outstanding) is not a debt payment. */
export function isActiveLoan(loan: Loan): boolean {
  return loan.outstandingPrincipal > 0;
}

/** Holdings that count as liquid for the emergency fund and the goal: cash or liquid, not volatile. */
export function isLiquidHolding(h: Holding): boolean {
  return !h.volatile && (h.liquidityClass === "cash" || h.liquidityClass === "liquid");
}

/** Population standard deviation divided by the mean; 0 when the mean is 0. */
export function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

export function buildSnapshot(input: BuildSnapshotInput): Snapshot {
  const { month, profile } = input;
  const transactions = input.transactions.filter((t) => t.month === month);
  const loans = input.loans.filter((l) => l.month === month && isActiveLoan(l));
  const holdings = input.holdings.filter((h) => h.month === month);

  // Income: inflows classed as income. Own-account transfers have their own class and so never
  // count; a credit of any other class (a refund) is not income either.
  let computedNetIncome = 0;
  let essentialSpending = 0;
  let discretionarySpending = 0;
  let cashWithdrawals = 0;
  const discretionaryByCategory: Record<string, number> = {};

  for (const t of transactions) {
    switch (t.cls) {
      case "income":
        if (t.direction === "in") computedNetIncome += t.amount;
        break;
      case "essential":
        essentialSpending += signed(t);
        break;
      case "discretionary": {
        discretionarySpending += signed(t);
        const category = t.category ?? "other";
        discretionaryByCategory[category] = (discretionaryByCategory[category] ?? 0) + signed(t);
        break;
      }
      case "cash":
        cashWithdrawals += signed(t);
        break;
      default:
        // debt_payment: counted from the loan statements instead, to avoid double counting.
        // investment: moving money between the user's own pockets, not spending.
        // own_transfer and unclassified rows: ignored.
        break;
    }
  }

  // The user confirmed their income in the profile; the statements' figure is kept for display.
  const netIncome = profile.netMonthlyIncome > 0 ? profile.netMonthlyIncome : computedNetIncome;

  const debtPayments = loans.reduce((sum, l) => sum + l.monthlyInstallment, 0);
  const bankBalances = (input.bankBalances ?? []).reduce((sum, b) => sum + b, 0);
  const liquidHoldings = holdings
    .filter(isLiquidHolding)
    .reduce((sum, h) => sum + h.currentValue, 0);
  const volatileAssets = holdings
    .filter((h) => h.volatile)
    .reduce((sum, h) => sum + h.currentValue, 0);

  const snapshot: Snapshot = {
    month,
    netIncome,
    computedNetIncome,
    essentialSpending: Math.max(0, essentialSpending),
    discretionarySpending: Math.max(0, discretionarySpending),
    discretionaryByCategory,
    cashWithdrawals: Math.max(0, cashWithdrawals),
    debtPayments,
    loans,
    liquidAssets: bankBalances + liquidHoldings,
    volatileAssets,
    estimatedSources: [],
  };
  if (input.bankBalances && input.bankBalances.length > 0) snapshot.bankBalances = bankBalances;

  if (profile.employment === "freelance") {
    const series = [...(input.incomeHistory ?? []), computedNetIncome];
    if (series.length >= 2) snapshot.incomeVariability = coefficientOfVariation(series);
  }

  return snapshot;
}
