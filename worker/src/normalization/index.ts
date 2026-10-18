import type { Transaction } from "@adidi/shared";
import type { JsonModel } from "../gemini/client.js";
import { classifyTransactions } from "./classify.js";
import { dedupTransactions } from "./dedup.js";
import { markOwnTransfers } from "./own-transfers.js";
import { markRecurring } from "./recurring.js";

// Stage 3, "cleaning": dedup -> own transfers -> classification -> recurring. Pure apart from
// the Flash calls inside classification.

export interface NormalizeInput {
  transactions: Transaction[];
  /** Earlier months' stored transactions, for recurring detection. */
  history?: Transaction[];
}

export interface NormalizeStats {
  input: number;
  duplicatesRemoved: number;
  ownTransferPairs: number;
  ownTransfersByPattern: number;
  classifiedByRule: number;
  classifiedByModel: number;
  classifiedByDefault: number;
  recurring: number;
}

export interface NormalizeResult {
  transactions: Transaction[];
  removedDuplicates: Transaction[];
  stats: NormalizeStats;
  warnings: string[];
}

export async function normalize(
  input: NormalizeInput,
  model: JsonModel,
  log?: (message: string) => void,
): Promise<NormalizeResult> {
  const deduped = dedupTransactions(input.transactions);
  const transfers = markOwnTransfers(deduped.kept);
  const classified = await classifyTransactions(transfers.transactions, model, { log });
  const transactions = markRecurring(classified.transactions, input.history);

  const stats: NormalizeStats = {
    input: input.transactions.length,
    duplicatesRemoved: deduped.removed.length,
    ownTransferPairs: transfers.pairs.length,
    ownTransfersByPattern: transfers.byPattern.length,
    classifiedByRule: classified.byRule,
    classifiedByModel: classified.byModel,
    classifiedByDefault: classified.fallback,
    recurring: transactions.filter((t) => t.recurring).length,
  };
  log?.(
    `normalized ${stats.input} rows: ${stats.duplicatesRemoved} duplicates, ${stats.ownTransferPairs} transfer pairs, ${stats.classifiedByRule} by rule, ${stats.classifiedByModel} by model, ${stats.classifiedByDefault} by default`,
  );
  return { transactions, removedDuplicates: deduped.removed, stats, warnings: classified.warnings };
}

export { classifyTransactions } from "./classify.js";
export { dedupTransactions } from "./dedup.js";
export { markOwnTransfers } from "./own-transfers.js";
export { markRecurring } from "./recurring.js";
export { applyRules } from "./rules.js";
