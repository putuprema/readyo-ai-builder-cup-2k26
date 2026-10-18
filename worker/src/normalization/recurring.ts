import type { Transaction } from "@adidi/shared";
import knownPatterns from "./known-patterns.json" with { type: "json" };
import { containsAny, normalizeText, searchText } from "./text.js";

// Stage 3 step 4 (specs/04-extraction.md): recurring detection in code. A transaction is
// recurring when the same counterparty shows a similar amount in two or more months (this
// month plus stored history), or when it is a known subscription merchant or an instalment.

export const SIMILAR_AMOUNT_TOLERANCE = 0.1;

export function markRecurring(
  transactions: Transaction[],
  history: Transaction[] = [],
): Transaction[] {
  const historyByKey = new Map<string, { month: string; amount: number }[]>();
  for (const h of history) {
    const key = counterpartyKey(h);
    if (!key) continue;
    const list = historyByKey.get(key) ?? [];
    list.push({ month: h.month, amount: h.amount });
    historyByKey.set(key, list);
  }

  return transactions.map((t) => {
    if (t.direction !== "out") return t.recurring === undefined ? { ...t, recurring: false } : t;
    const recurring =
      t.cls === "debt_payment" ||
      t.category === "subscriptions" ||
      containsAny(searchText(t), knownPatterns.subscriptions) ||
      seenInAnotherMonth(t, historyByKey);
    return { ...t, recurring };
  });
}

function seenInAnotherMonth(
  t: Transaction,
  historyByKey: Map<string, { month: string; amount: number }[]>,
): boolean {
  const key = counterpartyKey(t);
  if (!key) return false;
  const past = historyByKey.get(key) ?? [];
  return past.some(
    (p) =>
      p.month !== t.month && Math.abs(p.amount - t.amount) <= t.amount * SIMILAR_AMOUNT_TOLERANCE,
  );
}

/** The counterparty, or the start of the description when the statement names none. */
export function counterpartyKey(t: Transaction): string {
  const counterparty = normalizeText(t.counterparty);
  if (counterparty) return counterparty;
  return normalizeText(t.rawDescription).slice(0, 16);
}
