import type { Transaction } from "@adidi/shared";
import { normalizeText } from "./text.js";

// Stage 3 step 1 (specs/04-extraction.md): overlapping statements of the same account (two
// months of the same bank PDF, several screenshots of the same wallet history) repeat rows.
// Same account, date, amount, direction and counterparty -> one transaction.
//
// Rows from the same file are never merged: a statement does not repeat its own rows, and two
// identical purchases on one day are real.

export interface DedupResult {
  kept: Transaction[];
  removed: Transaction[];
}

export function dedupTransactions(transactions: Transaction[]): DedupResult {
  const seen = new Map<string, Transaction>();
  const kept: Transaction[] = [];
  const removed: Transaction[] = [];
  for (const t of transactions) {
    const key = [
      normalizeText(t.sourceAccount),
      t.date,
      t.amount,
      t.direction,
      normalizeText(t.counterparty),
    ].join("|");
    const first = seen.get(key);
    if (first && first.sourceFileId !== t.sourceFileId) {
      removed.push(t);
      continue;
    }
    if (!first) seen.set(key, t);
    kept.push(t);
  }
  return { kept, removed };
}
