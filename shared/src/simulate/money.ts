// Pure money math for simulate() (specs/02-simulate.md). No rounding here: callers round
// once when they store a MonthState, so intermediate months do not accumulate rounding error.

/**
 * Monthly installment of an annuity loan: P × r / (1 − (1 + r)^−n), r = annual rate / 12.
 * A zero rate degenerates to P / n.
 */
export function annuity(principal: number, annualRate: number, months: number): number {
  if (months <= 0) throw new RangeError("annuity: months must be positive");
  if (principal <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - (1 + r) ** -months);
}

/** Value after `months` months of compound growth at `annualRate` per year: v × (1 + g)^(m/12). */
export function grow(value: number, annualRate: number, months: number): number {
  if (months === 0) return value;
  return value * (1 + annualRate) ** (months / 12);
}

/** Outstanding principal after one month: interest accrues, then the installment is paid. */
export function amortizeOneMonth(
  outstanding: number,
  annualRate: number,
  installment: number,
): number {
  const next = outstanding * (1 + annualRate / 12) - installment;
  return next > 0 ? next : 0;
}

/** Whole months from one "YYYY-MM" key to another (negative when `to` is earlier). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  if (!fy || !fm || !ty || !tm)
    throw new RangeError(`monthsBetween: bad month key ${from} / ${to}`);
  return (ty - fy) * 12 + (tm - fm);
}
