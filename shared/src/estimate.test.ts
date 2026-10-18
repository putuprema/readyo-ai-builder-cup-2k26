import { describe, expect, it } from "vitest";
import {
  buildEstimate,
  growthRuleFor,
  monthKeyOf,
  targetAtGoalDate,
  weddingSavingsTarget,
  yearsToGoal,
} from "./estimate.js";
import type { HouseInputs, WeddingInputs } from "./types.js";

// specs/05-pricing.md acceptance criteria: targetAtGoalDate = targetToday × 1.06^years to the
// rupiah, and the wedding response carries the savings target after contributions.

const rules = { growth_property: 0.06, growth_car: 0.07, growth_wedding: 0.03 };
const CALCULATED_AT = "2026-10-18T09:30:00.000Z";

const serpong: HouseInputs = {
  area: "Serpong",
  propertyType: "landed",
  landM2: 70,
  buildingM2: 90,
  market: "new",
  firstHome: true,
  targetYear: 2028,
};

const wedding: WeddingInputs = {
  targetMonth: "2027-10",
  city: "Jakarta",
  guests: 300,
  scale: "standard",
  partnerShare: 50_000_000,
  familyContribution: 60_000_000,
  honeymoon: "no",
};

const sources = [{ title: "Rumah123", url: "https://www.rumah123.com/", date: "2026-10" }];

describe("yearsToGoal", () => {
  it("counts whole years for a house or car, whatever the month", () => {
    expect(yearsToGoal("house", serpong, CALCULATED_AT)).toBe(2);
    expect(yearsToGoal("house", serpong, "2026-01-02T00:00:00Z")).toBe(2);
    expect(yearsToGoal("car", { ...serpong, targetYear: 2026 }, CALCULATED_AT)).toBe(0);
  });

  it("counts exact months for a wedding", () => {
    expect(yearsToGoal("wedding", wedding, CALCULATED_AT)).toBe(1);
    expect(yearsToGoal("wedding", { ...wedding, targetMonth: "2027-04" }, CALCULATED_AT)).toBe(0.5);
  });

  it("never goes negative when the goal date has passed", () => {
    expect(yearsToGoal("house", { ...serpong, targetYear: 2020 }, CALCULATED_AT)).toBe(0);
    expect(yearsToGoal("wedding", { ...wedding, targetMonth: "2026-01" }, CALCULATED_AT)).toBe(0);
  });
});

describe("targetAtGoalDate", () => {
  it("is targetToday × (1 + g)^years to the rupiah (the demo house)", () => {
    expect(targetAtGoalDate(1_350_000_000, 0.06, 2)).toBe(1_516_860_000);
  });

  it("returns an integer and the same price at zero years", () => {
    expect(targetAtGoalDate(1_234_567_891, 0.06, 1)).toBe(Math.round(1_234_567_891 * 1.06));
    expect(targetAtGoalDate(999_999_999, 0.07, 0)).toBe(999_999_999);
  });
});

describe("weddingSavingsTarget", () => {
  it("is cost − partner share − family contribution", () => {
    expect(weddingSavingsTarget(210_000_000, 50_000_000, 60_000_000)).toBe(100_000_000);
  });

  it("is never below zero when contributions cover the cost", () => {
    expect(weddingSavingsTarget(100_000_000, 80_000_000, 50_000_000)).toBe(0);
  });
});

describe("growthRuleFor", () => {
  it("maps each goal type to its growth rule", () => {
    expect(growthRuleFor("house")).toBe("growth_property");
    expect(growthRuleFor("car")).toBe("growth_car");
    expect(growthRuleFor("wedding")).toBe("growth_wedding");
  });
});

describe("buildEstimate", () => {
  it("stores the rule's rate, the grown target, the sources and the exact inputs", () => {
    const estimate = buildEstimate({
      type: "house",
      inputs: serpong,
      priced: {
        targetToday: 1_350_000_000,
        rangeLow: 1_100_000_000,
        rangeHigh: 1_600_000_000,
        sources,
      },
      rules,
      calculatedAt: CALCULATED_AT,
    });
    expect(estimate).toEqual({
      targetToday: 1_350_000_000,
      rangeLow: 1_100_000_000,
      rangeHigh: 1_600_000_000,
      growthRatePerYear: 0.06,
      targetAtGoalDate: 1_516_860_000,
      sources,
      inputsUsed: serpong,
      calculatedAt: CALCULATED_AT,
    });
    expect(estimate.inputsUsed).not.toBe(serpong); // a copy, so later form edits cannot touch it
    expect(estimate.savingsTarget).toBeUndefined();
  });

  it("adds the savings target after contributions for a wedding", () => {
    const estimate = buildEstimate({
      type: "wedding",
      inputs: wedding,
      priced: { targetToday: 210_000_000, rangeLow: 180_000_000, rangeHigh: 260_000_000, sources },
      rules,
      calculatedAt: CALCULATED_AT,
    });
    expect(estimate.growthRatePerYear).toBe(0.03);
    expect(estimate.targetAtGoalDate).toBe(Math.round(210_000_000 * 1.03));
    expect(estimate.savingsTarget).toBe(100_000_000);
  });

  it("refuses to guess when the growth rule is missing", () => {
    expect(() =>
      buildEstimate({
        type: "car",
        inputs: serpong,
        priced: { targetToday: 1, rangeLow: 1, rangeHigh: 1, sources },
        rules: { growth_property: 0.06 },
        calculatedAt: CALCULATED_AT,
      }),
    ).toThrow(/growth_car/);
  });
});

describe("monthKeyOf", () => {
  it("takes the UTC month of an ISO timestamp and rejects garbage", () => {
    expect(monthKeyOf("2026-12-31T23:00:00.000Z")).toBe("2026-12");
    expect(() => monthKeyOf("yesterday")).toThrow(RangeError);
  });
});
