import type { Transaction } from "@adidi/shared";

// Small text helpers shared by the normalization steps.

/** Lower-case, whitespace collapsed, used for every keyword match. */
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Counterparty and description together, normalized, the haystack for keyword matching. */
export function searchText(t: Pick<Transaction, "counterparty" | "rawDescription">): string {
  return normalizeText(`${t.counterparty} ${t.rawDescription}`);
}

export function containsAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(normalizeText(needle)));
}

export function findAny(haystack: string, needles: readonly string[]): string | undefined {
  return needles.find((needle) => haystack.includes(normalizeText(needle)));
}

/** Whole days between two YYYY-MM-DD dates (absolute). */
export function daysBetween(a: string, b: string): number {
  const ms = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));
  return Math.round(ms / 86_400_000);
}
