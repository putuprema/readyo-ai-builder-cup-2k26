import type { Transaction } from "@adidi/shared";
import knownPatterns from "./known-patterns.json" with { type: "json" };
import { containsAny, daysBetween, normalizeText, searchText } from "./text.js";

// Stage 3 step 2 (specs/04-extraction.md): money moving between the user's own accounts is
// neither spending nor income. Two ways to see it:
//
// 1. Matching legs: an "out" in one account and an "in" of the same amount in another account
//    within two days. Both legs become own_transfer. Matching is one-to-one, earliest first.
// 2. Known patterns on a single leg, for when the other account's statement was not uploaded:
//    a top-up to an e-wallet, a transfer to an investment app (decision recorded in the spec:
//    own_transfer, not investment), or wording such as "pindah buku".

export const OWN_TRANSFER_WINDOW_DAYS = 2;

export interface OwnTransferResult {
  transactions: Transaction[];
  /** Pairs found by leg matching, as [out id, in id]. */
  pairs: [string, string][];
  /** Ids classified from a known pattern alone. */
  byPattern: string[];
}

export function markOwnTransfers(transactions: Transaction[]): OwnTransferResult {
  const byId = new Map(transactions.map((t) => [t.id, { ...t }]));
  const pairs: [string, string][] = [];
  const byPattern: string[] = [];

  const outs = transactions
    .filter((t) => t.direction === "out")
    .sort((a, b) => a.date.localeCompare(b.date));
  const ins = transactions
    .filter((t) => t.direction === "in")
    .sort((a, b) => a.date.localeCompare(b.date));
  const matchedIns = new Set<string>();

  for (const out of outs) {
    const candidate = ins.find(
      (inn) =>
        !matchedIns.has(inn.id) &&
        inn.amount === out.amount &&
        normalizeText(inn.sourceAccount) !== normalizeText(out.sourceAccount) &&
        daysBetween(inn.date, out.date) <= OWN_TRANSFER_WINDOW_DAYS,
    );
    if (!candidate) continue;
    matchedIns.add(candidate.id);
    pairs.push([out.id, candidate.id]);
    setClass(byId, out.id);
    setClass(byId, candidate.id);
  }

  for (const t of transactions) {
    if (byId.get(t.id)?.cls === "own_transfer") continue;
    if (looksLikeOwnTransfer(t)) {
      setClass(byId, t.id);
      byPattern.push(t.id);
    }
  }

  return { transactions: transactions.map((t) => byId.get(t.id) ?? t), pairs, byPattern };
}

function setClass(byId: Map<string, Transaction>, id: string): void {
  const t = byId.get(id);
  if (t) byId.set(id, { ...t, cls: "own_transfer", category: "own_transfer" });
}

/** Single-leg recognition from the known patterns. Exported for the classification rules. */
export function looksLikeOwnTransfer(t: Transaction): boolean {
  const text = searchText(t);
  if (containsAny(text, knownPatterns.ownTransferWords)) return true;
  if (t.direction === "out") {
    // Bank or wallet -> e-wallet top-up, or -> investment app.
    if (containsAny(text, knownPatterns.topUpWords) && containsAny(text, knownPatterns.ewallets)) {
      return true;
    }
    if (containsAny(text, knownPatterns.investmentApps)) return true;
  } else {
    // The e-wallet side of a top-up: "Top up" with no merchant, or "Top up via BCA".
    if (containsAny(text, knownPatterns.topUpWords)) return true;
  }
  return false;
}
