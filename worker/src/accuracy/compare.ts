import type { Holding, Loan, Transaction } from "@adidi/shared";
import type { ExpectedFile } from "../fixtures.js";
import { normalizeText } from "../normalization/text.js";

// Scoring of one extraction against its hand-written expectation (specs/04-extraction.md,
// acceptance criteria). Pure, so the thresholds are unit-tested without a model.
//
// Rows: each expected transaction is matched to one extracted row with the same amount and the
// closest date (greedy, one-to-one). A row counts as correct when date, amount and direction
// all match. The target is >= 95% of expected rows correct, and never more extracted rows
// than expected ("no invented rows").

export const ROW_ACCURACY_TARGET = 0.95;

export interface RowScore {
  expected: number;
  extracted: number;
  matched: number;
  correct: number;
  dateCorrect: number;
  directionCorrect: number;
  /** correct / expected, 1 when nothing was expected. */
  accuracy: number;
  invented: boolean;
}

export interface LoanScore {
  expected: number;
  extracted: number;
  /** Loans whose outstanding and instalment both match. */
  correct: number;
  exactlyOne: boolean;
}

export interface HoldingScore {
  expected: number;
  extracted: number;
  found: number;
  valueCorrect: number;
  volatileCorrect: number;
}

export interface ClassScore {
  /** Expected rows that carry a hand label. */
  labelled: number;
  matched: number;
  correct: number;
  accuracy: number;
}

export interface FixtureScore {
  name: string;
  kind: ExpectedFile["kind"];
  rows: RowScore;
  loans: LoanScore;
  holdings: HoldingScore;
  classes: ClassScore;
  /** Every criterion that applies to this fixture holds. */
  pass: boolean;
  failures: string[];
}

export interface Extracted {
  transactions: Transaction[];
  loans: Loan[];
  holdings: Holding[];
}

export function scoreFixture(
  name: string,
  expected: ExpectedFile,
  extracted: Extracted,
): FixtureScore {
  const rows = scoreRows(expected, extracted.transactions);
  const loans = scoreLoans(expected, extracted.loans);
  const holdings = scoreHoldings(expected, extracted.holdings);
  const classes = scoreClasses(expected, extracted.transactions);

  const failures: string[] = [];
  if (rows.invented) failures.push(`${rows.extracted} rows extracted, ${rows.expected} expected`);
  if (rows.expected > 0 && rows.accuracy < ROW_ACCURACY_TARGET) {
    failures.push(`row accuracy ${pct(rows.accuracy)} below ${pct(ROW_ACCURACY_TARGET)}`);
  }
  if (expected.loans.length > 0) {
    if (!loans.exactlyOne) failures.push(`${loans.extracted} loans, expected exactly 1`);
    else if (loans.correct < loans.expected)
      failures.push("loan outstanding or instalment differs");
  }
  if (expected.holdings.length > 0) {
    if (holdings.extracted > holdings.expected) {
      failures.push(`${holdings.extracted} holdings extracted, ${holdings.expected} expected`);
    }
    if (holdings.found < holdings.expected)
      failures.push(`${holdings.expected - holdings.found} holding(s) missing`);
    if (holdings.valueCorrect < holdings.found) failures.push("holding value differs");
    if (holdings.volatileCorrect < holdings.found) failures.push("volatile flag differs");
  }
  return {
    name,
    kind: expected.kind,
    rows,
    loans,
    holdings,
    classes,
    pass: failures.length === 0,
    failures,
  };
}

export function scoreRows(expected: ExpectedFile, transactions: Transaction[]): RowScore {
  const pairs = matchRows(expected.transactions, transactions);
  let correct = 0;
  let dateCorrect = 0;
  let directionCorrect = 0;
  for (const [exp, got] of pairs) {
    const date = exp.date === got.date;
    const direction = exp.direction === got.direction;
    if (date) dateCorrect += 1;
    if (direction) directionCorrect += 1;
    if (date && direction) correct += 1;
  }
  const expectedCount = expected.transactions.length;
  return {
    expected: expectedCount,
    extracted: transactions.length,
    matched: pairs.length,
    correct,
    dateCorrect,
    directionCorrect,
    accuracy: expectedCount === 0 ? 1 : correct / expectedCount,
    invented: transactions.length > expectedCount,
  };
}

type ExpectedRow = ExpectedFile["transactions"][number];

/** Greedy one-to-one matching on amount, closest date first. Exported for the class score. */
export function matchRows(
  expectedRows: ExpectedRow[],
  transactions: Transaction[],
): [ExpectedRow, Transaction][] {
  const candidates: { exp: ExpectedRow; got: Transaction; distance: number }[] = [];
  for (const exp of expectedRows) {
    for (const got of transactions) {
      if (got.amount !== exp.amount) continue;
      candidates.push({ exp, got, distance: dayDistance(exp.date, got.date) });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const usedExpected = new Set<ExpectedRow>();
  const usedGot = new Set<string>();
  const pairs: [ExpectedRow, Transaction][] = [];
  for (const { exp, got } of candidates) {
    if (usedExpected.has(exp) || usedGot.has(got.id)) continue;
    usedExpected.add(exp);
    usedGot.add(got.id);
    pairs.push([exp, got]);
  }
  return pairs;
}

function dayDistance(a: string, b: string): number {
  const ms = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));
  return Number.isFinite(ms) ? ms / 86_400_000 : 1_000;
}

export function scoreLoans(expected: ExpectedFile, loans: Loan[]): LoanScore {
  let correct = 0;
  for (const [i, exp] of expected.loans.entries()) {
    const got = loans[i];
    if (
      got &&
      got.outstandingPrincipal === exp.outstandingPrincipal &&
      got.monthlyInstallment === exp.monthlyInstallment
    ) {
      correct += 1;
    }
  }
  return {
    expected: expected.loans.length,
    extracted: loans.length,
    correct,
    exactlyOne: loans.length === 1,
  };
}

export function scoreHoldings(expected: ExpectedFile, holdings: Holding[]): HoldingScore {
  let found = 0;
  let valueCorrect = 0;
  let volatileCorrect = 0;
  const used = new Set<string>();
  for (const exp of expected.holdings) {
    const got = holdings.find((h) => !used.has(h.id) && holdingNameMatches(exp, h.instrument));
    if (!got) continue;
    used.add(got.id);
    found += 1;
    if (holdingValueMatches(exp, got)) valueCorrect += 1;
    if (got.volatile === exp.volatile) volatileCorrect += 1;
  }
  return {
    expected: expected.holdings.length,
    extracted: holdings.length,
    found,
    valueCorrect,
    volatileCorrect,
  };
}

/**
 * Instrument names as printed vary between runs ("*Cash USD", "*Cash", "NVDA NVIDIA CORPORATION
 * COM", "NVDA"), so names match when one contains the other once case, spaces and punctuation
 * are ignored. Exported for the live test.
 */
export function instrumentMatches(expected: string, extracted: string): boolean {
  const a = normalizeText(expected).replace(/[^a-z0-9]/g, "");
  const b = normalizeText(extracted).replace(/[^a-z0-9]/g, "");
  if (a.length === 0 || b.length === 0) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/** The expected name or any of its aliases. */
export function holdingNameMatches(
  exp: { instrument: string; aliases?: string[] },
  extracted: string,
): boolean {
  return [exp.instrument, ...(exp.aliases ?? [])].some((name) =>
    instrumentMatches(name, extracted),
  );
}

/** Rupiah compared exactly; a foreign-currency expectation compares the printed value. */
function holdingValueMatches(exp: ExpectedFile["holdings"][number], got: Holding): boolean {
  if (exp.currency !== undefined && exp.nativeValue !== undefined) {
    return (
      got.currency === exp.currency.toUpperCase() &&
      got.nativeValue !== undefined &&
      Math.abs(got.nativeValue - exp.nativeValue) < 0.005
    );
  }
  return got.currentValue === exp.currentValue;
}

export function scoreClasses(expected: ExpectedFile, transactions: Transaction[]): ClassScore {
  const labelled = expected.transactions.filter((row) => row.cls);
  const pairs = matchRows(labelled, transactions);
  const correct = pairs.filter(([exp, got]) => exp.cls === got.cls).length;
  return {
    labelled: labelled.length,
    matched: pairs.length,
    correct,
    accuracy: labelled.length === 0 ? 1 : correct / labelled.length,
  };
}

export function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** Plain-text table for the terminal and the deck's benchmark slide. */
export function formatTable(scores: FixtureScore[]): string {
  const header = [
    "fixture",
    "kind",
    "rows exp/got",
    "rows ok",
    "loan",
    "holdings ok",
    "class ok",
    "result",
  ];
  const lines = scores.map((s) => [
    s.name,
    s.kind,
    `${s.rows.expected}/${s.rows.extracted}`,
    s.rows.expected ? `${s.rows.correct}/${s.rows.expected} (${pct(s.rows.accuracy)})` : "-",
    s.loans.expected ? `${s.loans.correct}/${s.loans.expected}` : "-",
    s.holdings.expected
      ? `${Math.min(s.holdings.valueCorrect, s.holdings.volatileCorrect)}/${s.holdings.expected}`
      : "-",
    s.classes.labelled
      ? `${s.classes.correct}/${s.classes.labelled} (${pct(s.classes.accuracy)})`
      : "-",
    s.pass ? "pass" : `FAIL: ${s.failures.join("; ")}`,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i]?.length ?? 0)));
  const row = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ");
  return [row(header), row(widths.map((w) => "-".repeat(w))), ...lines.map(row)].join("\n");
}

/** Overall row accuracy across every fixture, weighted by expected rows. */
export function overallRowAccuracy(scores: FixtureScore[]): number {
  const expected = scores.reduce((n, s) => n + s.rows.expected, 0);
  const correct = scores.reduce((n, s) => n + s.rows.correct, 0);
  return expected === 0 ? 1 : correct / expected;
}
