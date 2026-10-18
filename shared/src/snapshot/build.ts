import type { Holding, Loan, Profile, Snapshot, SourceKind, Transaction } from "../types.js";

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
  /** Source kinds read this month. With `carriedFrom`, every kind of last month missing here is carried. */
  sources?: SourceKind[];
  /** Last month's snapshot and the source kinds it was built from (monthly check-in). */
  carriedFrom?: { snapshot: Snapshot; sources: SourceKind[] };
}

/** Display order of the source kinds in `estimatedSources`. */
export const SOURCE_KINDS: readonly SourceKind[] = [
  "bank",
  "ewallet",
  "paylater",
  "pinjol",
  "investment",
];

/** Sources whose records are transactions: income, spending and the account balances. */
const FLOW_SOURCES: readonly SourceKind[] = ["bank", "ewallet"];

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

interface Flows {
  computedNetIncome: number;
  essentialSpending: number;
  discretionarySpending: number;
  discretionaryByCategory: Record<string, number>;
  cashWithdrawals: number;
  /** Undefined when no statement showed a balance. */
  bankBalances?: number;
}

/** Income and spending from one month's transactions. */
function summarizeFlows(transactions: Transaction[], balances: number[] | undefined): Flows {
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

  const flows: Flows = {
    computedNetIncome,
    essentialSpending: Math.max(0, essentialSpending),
    discretionarySpending: Math.max(0, discretionarySpending),
    discretionaryByCategory,
    cashWithdrawals: Math.max(0, cashWithdrawals),
  };
  if (balances && balances.length > 0) flows.bankBalances = balances.reduce((s, b) => s + b, 0);
  return flows;
}

/** Last month's flows, read back from its snapshot. */
function flowsFrom(previous: Snapshot): Flows {
  return {
    computedNetIncome: previous.computedNetIncome ?? previous.netIncome,
    essentialSpending: previous.essentialSpending,
    discretionarySpending: previous.discretionarySpending,
    discretionaryByCategory: { ...previous.discretionaryByCategory },
    cashWithdrawals: previous.cashWithdrawals,
    ...(previous.bankBalances === undefined ? {} : { bankBalances: previous.bankBalances }),
  };
}

/** The source kinds of last month that were not read this month, in display order. */
export function missingSources(input: BuildSnapshotInput): SourceKind[] {
  if (!input.carriedFrom) return [];
  const present = new Set(input.sources ?? []);
  const last = new Set(input.carriedFrom.sources);
  return SOURCE_KINDS.filter((k) => last.has(k) && !present.has(k));
}

export function buildSnapshot(input: BuildSnapshotInput): Snapshot {
  const { month, profile } = input;
  const transactions = input.transactions.filter((t) => t.month === month);
  const holdings = input.holdings.filter((h) => h.month === month);
  let loans = input.loans.filter((l) => l.month === month && isActiveLoan(l));
  let liquidHoldings = holdings.filter(isLiquidHolding).reduce((s, h) => s + h.currentValue, 0);
  let volatileAssets = holdings.filter((h) => h.volatile).reduce((s, h) => s + h.currentValue, 0);
  let flows = summarizeFlows(transactions, input.bankBalances);

  // Monthly check-in with a source missing: that source's values come from last month and the
  // source is listed as estimated. Sources are carried in three buckets, because a stored
  // snapshot holds aggregates: flows (bank and e-wallet: income, spending, balances), each loan
  // type (its loans) and the investment holdings (liquid holdings and volatile assets).
  const estimatedSources = missingSources(input);
  const previous = input.carriedFrom?.snapshot;
  if (previous && estimatedSources.length > 0) {
    if (estimatedSources.some((k) => FLOW_SOURCES.includes(k))) flows = flowsFrom(previous);
    for (const kind of ["paylater", "pinjol"] as const) {
      if (!estimatedSources.includes(kind)) continue;
      loans = [...loans, ...previous.loans.filter((l) => l.type === kind && isActiveLoan(l))];
    }
    if (estimatedSources.includes("investment")) {
      liquidHoldings = Math.max(0, previous.liquidAssets - (previous.bankBalances ?? 0));
      volatileAssets = previous.volatileAssets;
    }
  }

  // The user confirmed their income in the profile; the statements' figure is kept for display.
  const netIncome =
    profile.netMonthlyIncome > 0 ? profile.netMonthlyIncome : flows.computedNetIncome;

  const snapshot: Snapshot = {
    month,
    netIncome,
    computedNetIncome: flows.computedNetIncome,
    essentialSpending: flows.essentialSpending,
    discretionarySpending: flows.discretionarySpending,
    discretionaryByCategory: flows.discretionaryByCategory,
    cashWithdrawals: flows.cashWithdrawals,
    debtPayments: loans.reduce((sum, l) => sum + l.monthlyInstallment, 0),
    loans,
    liquidAssets: (flows.bankBalances ?? 0) + liquidHoldings,
    volatileAssets,
    estimatedSources,
  };
  if (flows.bankBalances !== undefined) snapshot.bankBalances = flows.bankBalances;

  if (profile.employment === "freelance") {
    const series = [...(input.incomeHistory ?? []), flows.computedNetIncome];
    if (series.length >= 2) snapshot.incomeVariability = coefficientOfVariation(series);
  }

  return snapshot;
}
