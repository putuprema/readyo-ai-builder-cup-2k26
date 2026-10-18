import { DEFAULT_MAX_MONTHS, formatRupiah, pct } from "@adidi/shared";

// Display helpers for the result page. Formatting only: every value comes from the analysis
// document, the browser never computes a new figure (specs/11-ui-progress-result.md).

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parseMonthKey(month: string): { year: number; monthIndex: number } {
  const [y, m] = month.split("-");
  const year = Number(y);
  const monthIndex = Number(m) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11)
    throw new RangeError(`Bad month key: ${month}`);
  return { year, monthIndex };
}

/** "2026-09" → "September 2026". */
export function monthName(month: string): string {
  const { year, monthIndex } = parseMonthKey(month);
  return `${MONTH_NAMES[monthIndex]} ${year}`;
}

/** "2026-09" → "September". */
export function monthShortName(month: string): string {
  return MONTH_NAMES[parseMonthKey(month).monthIndex] as string;
}

/** The month after a "YYYY-MM" key. */
export function nextMonthKey(month: string): string {
  const { year, monthIndex } = parseMonthKey(month);
  const d = new Date(Date.UTC(year, monthIndex + 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const HORIZON_YEARS = Math.round(DEFAULT_MAX_MONTHS / 12);

/** "24 months", "1 month", "this month" for 0, "not within 30 years" for null. */
export function monthsText(months: number | null): string {
  if (months === null) return `not within ${HORIZON_YEARS} years`;
  if (months === 0) return "this month";
  return `${months} ${months === 1 ? "month" : "months"}`;
}

/**
 * Long horizons in years: 216 months → "18 years"; under two years stays in months.
 * Rounded to the nearest year, so the cash card reads at a glance.
 */
export function yearsText(months: number | null): string {
  if (months === null) return `not within ${HORIZON_YEARS} years`;
  if (months < 24) return monthsText(months);
  const years = Math.round(months / 12);
  return `${years} years`;
}

/** The big figure of a path card: the number and its unit on separate lines. */
export function bigFigure(
  months: number | null,
  scale: "months" | "years",
): { value: string; unit: string } {
  if (months === null) return { value: `${HORIZON_YEARS}+`, unit: "years, not within the horizon" };
  if (months === 0) return { value: "Now", unit: "approvable this month" };
  if (scale === "years" && months >= 24) {
    const years = Math.round(months / 12);
    return { value: String(years), unit: "years with the plan" };
  }
  return { value: String(months), unit: `${months === 1 ? "month" : "months"} with the plan` };
}

export { formatRupiah, pct };

/** 4.5777 → "4.6 months"; 1 → "1 month". */
export function monthsCount(n: number): string {
  const shown = Number(n.toFixed(1));
  return `${shown} ${shown === 1 ? "month" : "months"}`;
}

/** "Rp 28 m / mo". */
export function perMonth(amount: number): string {
  return `${formatRupiah(amount)} / mo`;
}
