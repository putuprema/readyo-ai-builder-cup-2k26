import type { Estimate, EstimateResponse, HouseInputs } from "@adidi/shared";

// Sample estimate for building the form before the api is wired (replaced in task 5). The
// numbers are illustrative only; an area containing "nowhere" shows the failure path.

export function mockEstimateHouse(inputs: HouseInputs): Promise<EstimateResponse> {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (/nowhere/i.test(inputs.area)) {
        resolve({
          targetToday: null,
          message:
            "We could not find current listings for these details. Type the price you have in mind, or adjust the area and try again.",
        });
        return;
      }
      const base = inputs.propertyType === "apartment" ? 900_000_000 : 1_350_000_000;
      const years = Math.max(0, inputs.targetYear - new Date().getFullYear());
      const estimate: Estimate = {
        targetToday: base,
        rangeLow: Math.round(base * 0.81),
        rangeHigh: Math.round(base * 1.19),
        growthRatePerYear: 0.06,
        targetAtGoalDate: Math.round(base * 1.06 ** years),
        sources: [
          {
            title: "[Listing portal A] · 3 listings",
            url: "https://example.com/a",
            date: "Oct 2026",
          },
          { title: "[Developer price list]", url: "https://example.com/b", date: "Oct 2026" },
        ],
        inputsUsed: { ...inputs },
        calculatedAt: new Date().toISOString(),
      };
      resolve(estimate);
    }, 1500);
  });
}
