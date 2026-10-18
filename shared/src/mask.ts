// Masking of account, card and phone numbers before anything is stored (AGENTS.md:
// "Never log raw statement content or account numbers. Mask account and card numbers before
// storing."). Pure string helpers shared by the worker (extraction) and any later writer.

export const MASK = "****";

/** Digit runs at least this long are treated as account, card or phone numbers. */
export const SENSITIVE_DIGIT_RUN = 7;

/**
 * Keeps the last four digits of an account or card number and replaces the rest with the mask:
 * "1234567890" -> "****7890", "1234 5678 9012 3456" -> "****3456". Short values (four digits
 * or fewer) are returned as they are; null or empty input gives an empty string.
 */
export function maskAccountNumber(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return raw.trim();
  if (digits.length <= 4) return digits;
  return `${MASK}${digits.slice(-4)}`;
}

/**
 * Masks every digit run of `minLength` or more inside free text, keeping the last four digits,
 * so descriptions such as "TRSF KE 1234567890 BUDI" or "TOPUP GOPAY 081234567890" can be stored.
 * Amounts and dates live in their own fields, so losing them from the text costs nothing.
 */
export function maskDigitRuns(text: string, minLength: number = SENSITIVE_DIGIT_RUN): string {
  const pattern = new RegExp(`\\d{${minLength},}`, "g");
  return text.replace(pattern, (run) => `${MASK}${run.slice(-4)}`);
}

/**
 * True when any string anywhere inside `value` (objects and arrays are walked) still contains a
 * digit run of `minLength` or more. Used by the "no unmasked account numbers in stored records"
 * acceptance test. Numbers are not strings and are left alone: amounts are supposed to be large.
 */
export function hasLongDigitRun(value: unknown, minLength: number = SENSITIVE_DIGIT_RUN): boolean {
  const pattern = new RegExp(`\\d{${minLength},}`);
  const seen = new Set<unknown>();
  const walk = (node: unknown): boolean => {
    if (typeof node === "string") return pattern.test(node);
    if (!node || typeof node !== "object" || seen.has(node)) return false;
    seen.add(node);
    const children = Array.isArray(node) ? node : Object.values(node);
    return children.some(walk);
  };
  return walk(value);
}
