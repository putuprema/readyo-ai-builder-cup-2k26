import { describe, expect, it } from "vitest";
import { bigFigure, monthName, monthsText, nextMonthKey, yearsText } from "./format";

describe("month keys", () => {
  it("names months and finds the next one across a year end", () => {
    expect(monthName("2026-09")).toBe("September 2026");
    expect(nextMonthKey("2026-09")).toBe("2026-10");
    expect(nextMonthKey("2026-12")).toBe("2027-01");
  });
});

describe("monthsText", () => {
  it("handles 0, 1, many and null", () => {
    expect(monthsText(0)).toBe("this month");
    expect(monthsText(1)).toBe("1 month");
    expect(monthsText(24)).toBe("24 months");
    expect(monthsText(null)).toBe("not within 30 years");
  });
});

describe("yearsText and bigFigure", () => {
  it("shows long horizons in years and short ones in months", () => {
    expect(yearsText(216)).toBe("18 years");
    expect(yearsText(14)).toBe("14 months");
    expect(bigFigure(160, "years")).toEqual({ value: "13", unit: "years with the plan" });
    expect(bigFigure(14, "months")).toEqual({ value: "14", unit: "months with the plan" });
  });
  it("reads Now for month 0 and marks the horizon for null", () => {
    expect(bigFigure(0, "months").value).toBe("Now");
    expect(bigFigure(null, "months").value).toBe("30+");
  });
});
