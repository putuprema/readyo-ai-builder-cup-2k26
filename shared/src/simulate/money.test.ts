import { describe, expect, it } from "vitest";
import { amortizeOneMonth, annuity, grow, monthsBetween } from "./money.js";

describe("annuity", () => {
  it("matches the spec's KPR example within one rupiah", () => {
    expect(Math.abs(annuity(640_000_000, 0.065, 240) - 4_771_668)).toBeLessThanOrEqual(1);
  });

  it("gives about Rp 1.1 m for House-A's PayLater refinanced to 13 percent over 12 months", () => {
    expect(annuity(12_400_000, 0.13, 12)).toBeCloseTo(1_107_500, -4);
  });

  it("degenerates to principal / months at a zero rate", () => {
    expect(annuity(12_000_000, 0, 12)).toBe(1_000_000);
  });

  it("pays the loan down to zero exactly at the end of the tenor", () => {
    const principal = 100_000_000;
    const rate = 0.09;
    const months = 36;
    const installment = annuity(principal, rate, months);
    let outstanding = principal;
    for (let i = 0; i < months; i++) outstanding = amortizeOneMonth(outstanding, rate, installment);
    expect(outstanding).toBeLessThan(1); // floating point residue only
  });

  it("rejects a non-positive tenor and returns 0 for nothing owed", () => {
    expect(() => annuity(1_000_000, 0.1, 0)).toThrow(RangeError);
    expect(annuity(0, 0.1, 12)).toBe(0);
  });
});

describe("grow", () => {
  it("is the identity at month 0 and compounds yearly", () => {
    expect(grow(800_000_000, 0.06, 0)).toBe(800_000_000);
    expect(grow(800_000_000, 0.06, 12)).toBeCloseTo(848_000_000, 0);
    expect(grow(800_000_000, 0.06, 24)).toBeCloseTo(898_880_000, 0);
  });

  it("is monotone in the rate", () => {
    expect(grow(1_000, 0.07, 30)).toBeGreaterThan(grow(1_000, 0.06, 30));
  });
});

describe("amortizeOneMonth", () => {
  it("accrues one month of interest and never goes negative", () => {
    expect(amortizeOneMonth(12_400_000, 0.31, 2_100_000)).toBeCloseTo(10_620_333.33, 0);
    expect(amortizeOneMonth(1_000, 0.31, 2_100_000)).toBe(0);
  });
});

describe("monthsBetween", () => {
  it("counts whole months across year boundaries", () => {
    expect(monthsBetween("2026-09", "2026-09")).toBe(0);
    expect(monthsBetween("2026-09", "2026-12")).toBe(3);
    expect(monthsBetween("2026-09", "2030-12")).toBe(51);
    expect(monthsBetween("2026-09", "2026-01")).toBe(-8);
    expect(() => monthsBetween("2026", "2026-01")).toThrow(RangeError);
  });
});
