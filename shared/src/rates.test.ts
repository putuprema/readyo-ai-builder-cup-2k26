import { describe, expect, it } from "vitest";
import { effectiveAnnualRate } from "./rates.js";

describe("effectiveAnnualRate", () => {
  it("annualises a monthly rate: 2.95% per month is about 35% per year", () => {
    expect(effectiveAnnualRate({ kind: "monthly_rate", value: 0.0295 })).toBe(0.354);
  });

  it("passes an annual rate through", () => {
    expect(effectiveAnnualRate({ kind: "annual_rate", value: 0.18 })).toBe(0.18);
  });

  it("turns a flat monthly fee into a rate on the principal", () => {
    // Rp 300 k a month on Rp 12 m principal = 2.5% a month = 30% a year.
    expect(
      effectiveAnnualRate(
        { kind: "flat_monthly_fee", value: 300_000 },
        { outstandingPrincipal: 12_000_000 },
      ),
    ).toBe(0.3);
  });

  it("spreads a total fee over the tenor", () => {
    // Rp 1.8 m over 6 months on Rp 12 m = Rp 300 k a month = 30% a year.
    expect(
      effectiveAnnualRate(
        { kind: "total_fee", value: 1_800_000 },
        { outstandingPrincipal: 12_000_000, totalTenorMonths: 6 },
      ),
    ).toBe(0.3);
    // Falls back to the remaining tenor when the total is unknown.
    expect(
      effectiveAnnualRate(
        { kind: "total_fee", value: 1_800_000 },
        { outstandingPrincipal: 12_000_000, remainingTenorMonths: 6 },
      ),
    ).toBe(0.3);
  });

  it("is zero when the bill shows no fee", () => {
    expect(effectiveAnnualRate({ kind: "none", value: null })).toBe(0);
    expect(effectiveAnnualRate({ kind: "monthly_rate", value: 0 })).toBe(0);
  });

  it("derives the rate from the instalment when the fee is unknown", () => {
    // Rp 12.4 m over 6 months would be Rp 2,066,667 a month; the bill asks Rp 2.1 m, so the fee is
    // about Rp 33 k a month = 0.27% a month = 3.2% a year.
    expect(
      effectiveAnnualRate(
        { kind: "unknown", value: null },
        {
          outstandingPrincipal: 12_400_000,
          monthlyInstallment: 2_100_000,
          remainingTenorMonths: 6,
        },
      ),
    ).toBe(0.0323);
  });

  it("returns null when nothing allows a computation", () => {
    expect(effectiveAnnualRate({ kind: "unknown", value: null })).toBeNull();
    expect(effectiveAnnualRate({ kind: "monthly_rate", value: null })).toBeNull();
    expect(effectiveAnnualRate({ kind: "flat_monthly_fee", value: 300_000 })).toBeNull();
    expect(
      effectiveAnnualRate({ kind: "total_fee", value: 1_800_000 }, { outstandingPrincipal: 12e6 }),
    ).toBeNull();
    expect(
      effectiveAnnualRate(
        { kind: "unknown", value: null },
        {
          outstandingPrincipal: 12_000_000,
          monthlyInstallment: 2_000_000,
          remainingTenorMonths: 6,
        },
      ),
    ).toBe(0);
  });

  it("rejects negative rates and fees", () => {
    expect(effectiveAnnualRate({ kind: "annual_rate", value: -0.1 })).toBeNull();
    expect(effectiveAnnualRate({ kind: "monthly_rate", value: -0.01 })).toBeNull();
  });
});
