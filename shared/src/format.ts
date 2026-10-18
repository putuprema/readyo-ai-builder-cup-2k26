/**
 * Money display and input helpers. All amounts are integer rupiah.
 *
 * Display rule (AGENTS.md): large amounts as "Rp 1.52 bn", "Rp 304 m", "Rp 320 k";
 * inputs use dot thousands separators ("1.350.000.000").
 */

const BILLION = 1_000_000_000;
const MILLION = 1_000_000;
const THOUSAND = 1_000;

/** Trim to at most `digits` significant decimals and drop trailing zeros: 1.5 → "1.5", 2 → "2". */
function compact(value: number, digits: number): string {
  return Number(value.toFixed(digits)).toString();
}

/**
 * Format an integer rupiah amount for display.
 *
 * formatRupiah(1_520_000_000) → "Rp 1.52 bn"
 * formatRupiah(304_000_000)   → "Rp 304 m"
 * formatRupiah(320_000)       → "Rp 320 k"
 * formatRupiah(950)           → "Rp 950"
 * Negative amounts keep the sign: "-Rp 1.2 m".
 */
export function formatRupiah(amount: number): string {
  if (!Number.isFinite(amount)) return "Rp –";
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(Math.round(amount));

  if (abs >= BILLION) return `${sign}Rp ${compact(abs / BILLION, 2)} bn`;
  if (abs >= MILLION) return `${sign}Rp ${compact(abs / MILLION, abs >= 100 * MILLION ? 0 : 1)} m`;
  if (abs >= THOUSAND)
    return `${sign}Rp ${compact(abs / THOUSAND, abs >= 100 * THOUSAND ? 0 : 1)} k`;
  return `${sign}Rp ${abs}`;
}

/**
 * Format an integer rupiah amount the way an input field shows it:
 * dot thousands separators, no currency prefix. 1350000000 → "1.350.000.000".
 */
export function formatRupiahInput(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  const sign = amount < 0 ? "-" : "";
  const digits = Math.abs(Math.round(amount)).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Parse what a user typed into a rupiah input. Accepts dots, commas, spaces and an
 * optional "Rp" prefix; ignores decimals. Returns null when no digits are present.
 *
 * parseRupiahInput("1.350.000.000") → 1350000000
 * parseRupiahInput("Rp 1,5 jt")     → null (units are not supported; the UI shows the hint)
 */
export function parseRupiahInput(text: string): number | null {
  const negative = /^\s*-/.test(text);
  const cleaned = text.replace(/^\s*-?\s*(Rp\.?)?\s*/i, "").trim();
  if (!/^[\d.,\s]+$/.test(cleaned)) return null;
  const digits = cleaned.replace(/[^\d]/g, "");
  if (digits.length === 0) return null;
  const value = Number(digits);
  if (!Number.isSafeInteger(value)) return null;
  return negative ? -value : value;
}
