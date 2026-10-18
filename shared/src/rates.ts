// Effective annual rate of a loan from the fee structure printed on its bill
// (specs/04-extraction.md: "compute effectiveAnnualRate in code from the fee structure Gemini
// extracted (e.g. 2.95% per month -> about 35% per year), not from the model").
//
// The rate is the nominal annualised fee rate: the monthly fee as a share of the principal it is
// charged on, times twelve. That is the figure Indonesian lenders and the OJK quote, and the
// one the `expensive_debt` metric (rate above 24% a year) compares against.

export type FeeKind =
  | "monthly_rate"
  | "annual_rate"
  | "flat_monthly_fee"
  | "total_fee"
  | "none"
  | "unknown";

export interface FeeStructure {
  kind: FeeKind;
  /** Rate as a fraction (2.95% -> 0.0295) for the rate kinds, rupiah for the fee kinds. */
  value: number | null;
}

export interface LoanFigures {
  outstandingPrincipal?: number | null;
  monthlyInstallment?: number | null;
  remainingTenorMonths?: number | null;
  totalTenorMonths?: number | null;
}

const MONTHS_PER_YEAR = 12;

function positive(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Returns the annual rate as a fraction (0.354 for 35.4%), or null when the bill gives no way to
 * compute it. Callers fall back to a documented assumption in that case.
 *
 * - monthly_rate r: r x 12.
 * - annual_rate r: r.
 * - flat_monthly_fee f on principal P: f / P x 12.
 * - total_fee F over n months (total tenor, else remaining) on principal P: F / n / P x 12.
 * - none: 0.
 * - unknown: derived from the instalment when principal, instalment and remaining tenor are
 *   known (fee per month = instalment - principal / tenor); otherwise null.
 */
export function effectiveAnnualRate(fee: FeeStructure, loan: LoanFigures = {}): number | null {
  const principal = loan.outstandingPrincipal;
  switch (fee.kind) {
    case "monthly_rate":
      return positive(fee.value) ? round4(fee.value * MONTHS_PER_YEAR) : fee.value === 0 ? 0 : null;
    case "annual_rate":
      return typeof fee.value === "number" && fee.value >= 0 ? round4(fee.value) : null;
    case "flat_monthly_fee":
      if (!positive(principal) || typeof fee.value !== "number" || fee.value < 0) return null;
      return round4((fee.value / principal) * MONTHS_PER_YEAR);
    case "total_fee": {
      const tenor = positive(loan.totalTenorMonths)
        ? loan.totalTenorMonths
        : loan.remainingTenorMonths;
      if (!positive(principal) || !positive(tenor) || typeof fee.value !== "number") return null;
      if (fee.value < 0) return null;
      return round4((fee.value / tenor / principal) * MONTHS_PER_YEAR);
    }
    case "none":
      return 0;
    case "unknown": {
      const tenor = loan.remainingTenorMonths;
      const installment = loan.monthlyInstallment;
      if (!positive(principal) || !positive(tenor) || !positive(installment)) return null;
      const feePerMonth = installment - principal / tenor;
      if (feePerMonth <= 0) return 0;
      return round4((feePerMonth / principal) * MONTHS_PER_YEAR);
    }
    default:
      return null;
  }
}
