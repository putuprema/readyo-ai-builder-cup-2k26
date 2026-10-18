import { MONTH_PATTERN } from "./paths.js";

// Calendar rules around submitted months (specs/07-pipeline-runs.md: "Reuse rule", "Banner
// rule"). Pure: the caller passes today's date, so the boundaries are unit-tested.

/** A new goal may reuse the latest submitted month if it is no older than this. */
export const REUSE_MAX_AGE_DAYS = 45;

/** "YYYY-MM" of a date, in UTC. */
export function monthKeyOfDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The month before a "YYYY-MM" key. */
export function previousMonthKey(month: string): string {
  const { year, monthIndex } = parseMonthKey(month);
  return monthKeyOfDate(new Date(Date.UTC(year, monthIndex - 1, 1)));
}

/** The latest month key in a list, or null when the list is empty. */
export function latestMonth(months: readonly string[]): string | null {
  let latest: string | null = null;
  for (const m of months) if (latest === null || m > latest) latest = m;
  return latest;
}

/**
 * The banner rule: from the 1st of month M+1 until month M is submitted, the goals list says
 * "{Month} is over: add its statements". Returns the month to ask for, or null when the
 * previous calendar month is already submitted.
 */
export function monthlyBannerFor(today: Date, submittedMonths: readonly string[]): string | null {
  const previous = previousMonthKey(monthKeyOfDate(today));
  return submittedMonths.includes(previous) ? null : previous;
}

/**
 * The reuse rule: the latest submitted month, when its statements are recent enough to analyse
 * a new goal without a fresh upload. "Age" is counted from the end of that month (the day the
 * statements could first have been complete). Returns null when there is no such month.
 */
export function reusableMonth(
  submittedMonths: readonly string[],
  today: Date,
  maxAgeDays: number = REUSE_MAX_AGE_DAYS,
): string | null {
  const latest = latestMonth(submittedMonths);
  if (latest === null) return null;
  const { year, monthIndex } = parseMonthKey(latest);
  const endOfMonth = Date.UTC(year, monthIndex + 1, 1); // first instant after the month
  const ageDays = (today.getTime() - endOfMonth) / 86_400_000;
  return ageDays <= maxAgeDays ? latest : null;
}

function parseMonthKey(month: string): { year: number; monthIndex: number } {
  if (!MONTH_PATTERN.test(month)) throw new RangeError(`Bad month key: ${month}`);
  const [year, m] = month.split("-").map(Number) as [number, number];
  return { year, monthIndex: m - 1 };
}
