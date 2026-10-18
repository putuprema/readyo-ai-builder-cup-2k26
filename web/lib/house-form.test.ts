import type { Estimate } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { cityForArea, HOUSE_CITIES } from "./cities";
import {
  canContinue,
  defaultHouseForm,
  describeHouseInputs,
  houseFormFromInputs,
  isEstimateStale,
  relativeTime,
  targetYears,
  toHouseInputs,
} from "./house-form";

const NOW = new Date("2026-10-18T10:00:00Z");

const filled = {
  ...defaultHouseForm(NOW),
  area: "Serpong, Tangerang Selatan",
  targetYear: 2028,
  landM2: "90",
  buildingM2: "70",
};

const estimate: Estimate = {
  targetToday: 1_350_000_000,
  rangeLow: 1_100_000_000,
  rangeHigh: 1_600_000_000,
  growthRatePerYear: 0.06,
  targetAtGoalDate: 1_516_860_000,
  sources: [],
  inputsUsed: {
    area: "Serpong, Tangerang Selatan",
    propertyType: "landed",
    landM2: 90,
    buildingM2: 70,
    market: "new",
    firstHome: true,
    targetYear: 2028,
  },
  calculatedAt: "2026-10-18T09:58:00Z",
};

describe("toHouseInputs", () => {
  it("maps the filled form to HouseInputs without undefined optionals", () => {
    const result = toHouseInputs(filled);
    expect(result).toEqual({
      ok: true,
      inputs: {
        area: "Serpong, Tangerang Selatan",
        propertyType: "landed",
        landM2: 90,
        buildingM2: 70,
        market: "new",
        firstHome: true,
        targetYear: 2028,
      },
    });
    if (result.ok) expect(Object.values(result.inputs)).not.toContain(undefined);
  });

  it("requires a city from the list", () => {
    for (const area of ["", "  ", "Surabaya", "serpong, tangerang selatan"]) {
      const result = toHouseInputs({ ...filled, area });
      expect(result).toMatchObject({ ok: false, errors: { area: "Choose a city." } });
    }
  });

  it("accepts every offered city and stores its value as the area", () => {
    for (const city of HOUSE_CITIES) {
      const result = toHouseInputs({ ...filled, area: city.value });
      expect(result).toMatchObject({ ok: true, inputs: { area: city.value } });
    }
  });

  it("uses the budget range instead of sizes in budget mode", () => {
    const result = toHouseInputs({
      ...filled,
      sizeMode: "budget",
      budgetLow: "1.000.000.000",
      budgetHigh: "1.500.000.000",
    });
    expect(result).toMatchObject({
      ok: true,
      inputs: { budgetRange: [1_000_000_000, 1_500_000_000] },
    });
    if (result.ok) expect(result.inputs.landM2).toBeUndefined();
  });

  it("rejects a budget range with the high end below the low end", () => {
    const result = toHouseInputs({
      ...filled,
      sizeMode: "budget",
      budgetLow: "2.000.000.000",
      budgetHigh: "1.000.000.000",
    });
    expect(result).toMatchObject({ ok: false, errors: { budgetHigh: expect.any(String) } });
  });

  it("parses the planned down payment with dot separators and the joint choice", () => {
    const result = toHouseInputs({ ...filled, plannedDp: "280.000.000", joint: "joint" });
    expect(result).toMatchObject({
      ok: true,
      inputs: { plannedDp: 280_000_000, joint: "joint" },
    });
  });
});

describe("isEstimateStale", () => {
  it("is fresh when the form matches inputsUsed", () => {
    const current = toHouseInputs(filled);
    if (!current.ok) throw new Error("expected ok");
    expect(isEstimateStale(current.inputs, estimate)).toBe(false);
  });

  it("is stale after a different city is chosen", () => {
    const depok = toHouseInputs({ ...filled, area: "Depok" });
    if (!depok.ok) throw new Error("expected ok");
    expect(isEstimateStale(depok.inputs, estimate)).toBe(true);
  });

  it("is stale after a field changes, including an optional one", () => {
    const changed = toHouseInputs({ ...filled, buildingM2: "80" });
    const withDp = toHouseInputs({ ...filled, plannedDp: "100.000.000" });
    if (!changed.ok || !withDp.ok) throw new Error("expected ok");
    expect(isEstimateStale(changed.inputs, estimate)).toBe(true);
    expect(isEstimateStale(withDp.inputs, estimate)).toBe(true);
  });

  it("ignores the pay preference, which is not part of the inputs", () => {
    const cash = toHouseInputs({ ...filled, payPreference: "cash" });
    if (!cash.ok) throw new Error("expected ok");
    expect(isEstimateStale(cash.inputs, estimate)).toBe(false);
  });
});

describe("canContinue", () => {
  it("is disabled in the empty state", () => {
    expect(canContinue(null, null)).toBe(false);
  });
  it("is enabled with an estimate or a typed price", () => {
    expect(canContinue(estimate, null)).toBe(true);
    expect(canContinue(null, 900_000_000)).toBe(true);
  });
});

describe("houseFormFromInputs", () => {
  it("round-trips a draft's inputs", () => {
    const inputs = toHouseInputs({
      ...filled,
      plannedDp: "280.000.000",
      joint: "single_applicant",
    });
    if (!inputs.ok) throw new Error("expected ok");
    const form = houseFormFromInputs(inputs.inputs, "cash", NOW);
    expect(form).toMatchObject({
      area: "Serpong, Tangerang Selatan",
      landM2: "90",
      buildingM2: "70",
      plannedDp: "280.000.000",
      joint: "single_applicant",
      payPreference: "cash",
      sizeMode: "size",
    });
    expect(toHouseInputs(form)).toEqual(inputs);
  });

  it("maps an older free-text area to its city, or clears it so the user picks again", () => {
    const base = {
      propertyType: "landed",
      market: "new",
      firstHome: true,
      targetYear: 2028,
    } as const;
    expect(houseFormFromInputs({ ...base, area: "Tangerang Selatan" }, "loan", NOW).area).toBe(
      "Serpong, Tangerang Selatan",
    );
    expect(houseFormFromInputs({ ...base, area: " serpong " }, "loan", NOW).area).toBe(
      "Serpong, Tangerang Selatan",
    );
    expect(houseFormFromInputs({ ...base, area: "Surabaya" }, "loan", NOW).area).toBe("");
  });
});

describe("cities", () => {
  it("offers the five Jabodetabek sample cities with unique values", () => {
    expect(HOUSE_CITIES.map((c) => c.label)).toEqual([
      "Jakarta Selatan",
      "Tangerang Selatan (Serpong)",
      "Depok",
      "Bekasi",
      "Bogor",
    ]);
    expect(new Set(HOUSE_CITIES.map((c) => c.value)).size).toBe(HOUSE_CITIES.length);
  });
  it("matches the demo seed's area to the Serpong option", () => {
    expect(cityForArea("Tangerang Selatan")).toBe("Serpong, Tangerang Selatan");
    expect(cityForArea("Bogor")).toBe("Bogor");
    expect(cityForArea("")).toBe("");
  });
});

describe("text helpers", () => {
  it("describes the inputs the estimate used", () => {
    expect(describeHouseInputs(estimate.inputsUsed)).toBe(
      "landed, 70/90 m², new, Serpong, Tangerang Selatan, 2028",
    );
  });
  it("offers the next ten target years", () => {
    expect(targetYears(NOW)[0]).toBe(2027);
    expect(targetYears(NOW)).toHaveLength(10);
  });
  it("formats relative time", () => {
    expect(relativeTime("2026-10-18T09:58:00Z", NOW)).toBe("2 min ago");
    expect(relativeTime("2026-10-18T09:59:50Z", NOW)).toBe("just now");
    expect(relativeTime("2026-10-17T09:00:00Z", NOW)).toBe("yesterday");
  });
});
