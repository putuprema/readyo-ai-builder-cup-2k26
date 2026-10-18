import type {
  Analysis,
  Goal,
  Holding,
  Loan,
  MonthRecord,
  SourceKind,
  Transaction,
} from "@adidi/shared";
import { formatRupiah, isMonthKey, monthlyBannerFor } from "@adidi/shared";
import type { UploadItem } from "../../lib/documents";
import { monthShortName } from "../result/format";
import { currentPlan, leadingPath, loanProduct } from "../result/model";

// 5 · Monthly check-in (docs/screens.md, specs/13-ui-monthly-assumptions.md): which month is
// being added, one row per source submitted last month with what it contained, and the goal
// chips. Selection and formatting only; unit-tested.

/**
 * The month the check-in asks for: the latest finished month without a submission (the banner
 * rule, shared with the goals list), or null when it is already in. `override` is the
 * development-only `?month=` parameter, so a check-in can be tried before the month is over.
 */
export function checkInMonth(
  today: Date,
  submittedMonths: readonly string[],
  override?: string | null,
): string | null {
  if (override && isMonthKey(override) && !submittedMonths.includes(override)) return override;
  return monthlyBannerFor(today, submittedMonths);
}

/** The latest submitted month before `month`: the one whose sources the check-in repeats. */
export function previousSubmitted(
  submittedMonths: readonly string[],
  month: string,
): string | null {
  let latest: string | null = null;
  for (const m of submittedMonths) if (m < month && (latest === null || m > latest)) latest = m;
  return latest;
}

const KIND_LABELS: Record<SourceKind, string> = {
  bank: "Bank e-statement",
  ewallet: "E-wallet history",
  paylater: "PayLater bill",
  pinjol: "Pinjol bill",
  investment: "Investment portfolio",
};

export function kindLabel(kind: SourceKind): string {
  return KIND_LABELS[kind];
}

/** The amber drop zone's sentence after "Missing." for a source not added yet. */
export function missingHint(kind: SourceKind, monthName: string): string {
  switch (kind) {
    case "bank":
      return `Add ${monthName}'s e-statement.`;
    case "ewallet":
      return `Add ${monthName}'s history.`;
    case "paylater":
    case "pinjol":
      return `Still paying it off? Add ${monthName}'s bill.`;
    case "investment":
      return "A portfolio screenshot is enough.";
  }
}

export interface MonthRecords {
  transactions: Pick<Transaction, "sourceFileId" | "sourceAccount">[];
  loans: Pick<Loan, "sourceFileId" | "lender" | "outstandingPrincipal">[];
  holdings: Pick<Holding, "sourceFileId" | "provider" | "currentValue">[];
}

export interface SourceRow {
  /** Last month's document id; the row's key. */
  documentId: string;
  kind: SourceKind;
  /** "BCA", "Kredivo", "Bibit"; the file name when nothing was read from it. */
  title: string;
  kindLabel: string;
  /** What last month's file contained: "84 transactions", "1 loan, Rp 12.4 m". */
  contents: string;
}

/** One row per source submitted last month, in the order they were submitted. */
export function sourceRows(
  record: Pick<MonthRecord, "sources">,
  records: MonthRecords,
): SourceRow[] {
  return record.sources.map((source) => {
    const transactions = records.transactions.filter((t) => t.sourceFileId === source.documentId);
    const loans = records.loans.filter((l) => l.sourceFileId === source.documentId);
    const holdings = records.holdings.filter((h) => h.sourceFileId === source.documentId);
    return {
      documentId: source.documentId,
      kind: source.kind,
      title: sourceTitle(source, transactions, loans, holdings),
      kindLabel: kindLabel(source.kind),
      contents: sourceContents(source.kind, transactions.length, loans, holdings),
    };
  });
}

function sourceTitle(
  source: MonthRecord["sources"][number],
  transactions: MonthRecords["transactions"],
  loans: MonthRecords["loans"],
  holdings: MonthRecords["holdings"],
): string {
  const named =
    source.kind === "paylater" || source.kind === "pinjol"
      ? loans[0]?.lender
      : source.kind === "investment"
        ? holdings[0]?.provider
        : institutionOf(transactions[0]?.sourceAccount);
  return named?.trim() || withoutExtension(source.name);
}

/** "BCA ****4821" → "BCA": the institution part of a masked account label. */
export function institutionOf(account: string | undefined): string | undefined {
  if (!account) return undefined;
  const name = account.split(/[*•x]{2,}|\d{3,}/)[0]?.trim();
  return name || undefined;
}

function withoutExtension(name: string): string {
  return name.replace(/\.(pdf|png|jpe?g)$/i, "");
}

function sourceContents(
  kind: SourceKind,
  transactionCount: number,
  loans: MonthRecords["loans"],
  holdings: MonthRecords["holdings"],
): string {
  switch (kind) {
    case "bank":
    case "ewallet":
      return transactionCount > 0 ? plural(transactionCount, "transaction") : "Read last month";
    case "paylater":
    case "pinjol": {
      if (loans.length === 0) return "No active loan";
      const total = loans.reduce((sum, l) => sum + l.outstandingPrincipal, 0);
      return `${plural(loans.length, "loan")}, ${formatRupiah(total)}`;
    }
    case "investment": {
      if (holdings.length === 0) return "No holdings read";
      const total = holdings.reduce((sum, h) => sum + h.currentValue, 0);
      return `${plural(holdings.length, "holding")}, ${formatRupiah(total)}`;
    }
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// ---- goal chips ----

export interface GoalChip {
  goalId: string;
  type: Goal["type"];
  label: string;
  /** "14 mo to KPR", "KPR this month", "Ready in 3 yrs"; "Not analysed yet" without an analysis. */
  headline: string;
}

const GOAL_LABELS: Record<Goal["type"], string> = {
  house: "Buy a house",
  car: "Buy a car",
  wedding: "Wedding",
};

export function goalChip(goal: Goal, analysis: Analysis | null): GoalChip {
  return {
    goalId: goal.id,
    type: goal.type,
    label: GOAL_LABELS[goal.type],
    headline: analysis ? chipHeadline(goal, analysis) : "Not analysed yet",
  };
}

function chipHeadline(goal: Goal, analysis: Analysis): string {
  const plan = currentPlan(analysis);
  if (leadingPath(goal) === "loan" && plan.loan) {
    const product = loanProduct(goal);
    const months = plan.loan.monthsToReady;
    if (months === null) return `No ${product} within 30 yrs`;
    if (months === 0) return `${product} this month`;
    return `${months} mo to ${product}`;
  }
  const months = plan.cash.monthsToReady;
  if (months === null) return "Not within 30 yrs";
  if (months === 0) return "Ready this month";
  if (months < 24) return `Ready in ${months} mo`;
  return `Ready in ${Math.round(months / 12)} yrs`;
}

// ---- counters ----

/** "2 of 4 added". */
export function addedCounter(added: number, total: number): string {
  return `${added} of ${total} added`;
}

/** The footer line: "2 files added · updates 2 goals". */
export function checkInFooter(files: number, goals: number): string {
  const f = files === 0 ? "No files yet" : `${plural(files, "file")} added`;
  return `${f} · updates ${plural(goals, "goal")}`;
}

/** "October" for "2026-10". */
export function monthOnly(month: string): string {
  return monthShortName(month);
}

// ---- uploads and Submit ----

type SlotItem = Pick<UploadItem, "slot" | "status">;

/** How many of last month's sources have this month's file uploaded. */
export function addedCount(rows: readonly SourceRow[], items: readonly SlotItem[]): number {
  return rows.filter((row) =>
    items.some((i) => i.slot === row.documentId && i.status === "uploaded"),
  ).length;
}

/** Submit is allowed with sources missing, but needs one file in and nothing in flight. */
export function canSubmitCheckIn(items: readonly SlotItem[]): boolean {
  const inFlight = items.some((i) => i.status === "uploading" || i.status === "removing");
  return !inFlight && items.some((i) => i.status === "uploaded");
}

/** Every source kind, for a file added as a new source. */
export const ALL_KINDS: { value: SourceKind; label: string }[] = [
  { value: "bank", label: "Bank" },
  { value: "ewallet", label: "E-wallet" },
  { value: "paylater", label: "PayLater" },
  { value: "pinjol", label: "Pinjol" },
  { value: "investment", label: "Investment" },
];
