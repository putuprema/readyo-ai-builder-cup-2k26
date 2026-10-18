import { describe, expect, it } from "vitest";
import {
  latestMonth,
  monthKeyOfDate,
  monthlyBannerFor,
  previousMonthKey,
  reusableMonth,
} from "./months.js";

// specs/07-pipeline-runs.md acceptance criterion: "Banner rule unit-tested around month
// boundaries (31 Oct → no banner; 1 Nov without October → banner; 1 Nov with October → no
// banner)", plus the 45-day reuse rule.

describe("month keys", () => {
  it("formats in UTC", () => {
    expect(monthKeyOfDate(new Date("2026-10-31T23:59:59.000Z"))).toBe("2026-10");
    expect(monthKeyOfDate(new Date("2026-11-01T00:00:00.000Z"))).toBe("2026-11");
  });

  it("steps back across a year boundary", () => {
    expect(previousMonthKey("2026-11")).toBe("2026-10");
    expect(previousMonthKey("2027-01")).toBe("2026-12");
    expect(() => previousMonthKey("2026-13")).toThrow(RangeError);
  });

  it("finds the latest month", () => {
    expect(latestMonth(["2026-09", "2026-11", "2026-10"])).toBe("2026-11");
    expect(latestMonth([])).toBeNull();
  });
});

describe("monthlyBannerFor", () => {
  it("shows no banner on 31 October", () => {
    expect(monthlyBannerFor(new Date("2026-10-31T12:00:00.000Z"), ["2026-09"])).toBeNull();
  });

  it("asks for October on 1 November when October is missing", () => {
    expect(monthlyBannerFor(new Date("2026-11-01T00:00:00.000Z"), ["2026-09"])).toBe("2026-10");
  });

  it("shows no banner on 1 November when October is submitted", () => {
    expect(
      monthlyBannerFor(new Date("2026-11-01T00:00:00.000Z"), ["2026-09", "2026-10"]),
    ).toBeNull();
  });

  it("asks for December on 1 January", () => {
    expect(monthlyBannerFor(new Date("2027-01-01T00:00:00.000Z"), ["2026-11"])).toBe("2026-12");
  });

  it("keeps asking all month long until the month is submitted", () => {
    expect(monthlyBannerFor(new Date("2026-11-28T00:00:00.000Z"), ["2026-09"])).toBe("2026-10");
  });
});

describe("reusableMonth", () => {
  it("returns the latest month when it is recent enough", () => {
    // September ends 1 Oct; 18 Oct is 17 days later.
    expect(reusableMonth(["2026-08", "2026-09"], new Date("2026-10-18T09:00:00.000Z"))).toBe(
      "2026-09",
    );
  });

  it("returns null once the month is older than 45 days", () => {
    // September + 45 days = 15 Nov.
    expect(reusableMonth(["2026-09"], new Date("2026-11-15T00:00:00.000Z"))).toBe("2026-09");
    expect(reusableMonth(["2026-09"], new Date("2026-11-16T00:00:00.000Z"))).toBeNull();
  });

  it("returns null without any submitted month", () => {
    expect(reusableMonth([], new Date("2026-10-18T00:00:00.000Z"))).toBeNull();
  });

  it("takes the age limit as a parameter", () => {
    expect(reusableMonth(["2026-09"], new Date("2026-10-18T00:00:00.000Z"), 10)).toBeNull();
  });
});
