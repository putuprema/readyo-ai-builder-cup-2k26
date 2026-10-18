import { writeFileSync } from "node:fs";
import type { HouseInputs } from "@adidi/shared";
import { buildEstimate, targetAtGoalDate } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { createGeminiModel } from "../gemini/client.js";
import { priceGoal, pricingTier } from "./price.js";

// One real Gemini call with Google Search grounding (specs/05-pricing.md acceptance criterion:
// "landed, 70/90 m², new, Serpong, 2028" returns a target within its own range, at least one
// source with a URL, and targetAtGoalDate = targetToday × 1.06^years). Skipped without a key so
// `pnpm test` stays green offline. Run with: pnpm --filter api test:live
// (PRICING_MODEL_TIER=pro to compare the Pro tier; PRICING_LIVE_OUT=<file> keeps the answer).

const enabled = Boolean(process.env.GEMINI_API_KEY);

const serpong: HouseInputs = {
  area: "Serpong, Tangerang Selatan",
  propertyType: "landed",
  landM2: 70,
  buildingM2: 90,
  market: "new",
  firstHome: true,
  targetYear: 2028,
};

describe.skipIf(!enabled)("live house pricing", () => {
  it("prices the Serpong house with a range and dated sources", async () => {
    const result = await priceGoal("house", serpong, createGeminiModel(), { tier: pricingTier() });
    // PRICING_LIVE_OUT=<file> keeps the model's answer for inspection.
    if (process.env.PRICING_LIVE_OUT) {
      writeFileSync(process.env.PRICING_LIVE_OUT, JSON.stringify(result, null, 2));
    }
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { priced } = result;
    expect(priced.targetToday).toBeGreaterThanOrEqual(priced.rangeLow);
    expect(priced.targetToday).toBeLessThanOrEqual(priced.rangeHigh);
    expect(priced.targetToday).toBeGreaterThan(300_000_000);
    expect(priced.targetToday).toBeLessThan(10_000_000_000);
    expect(priced.sources.length).toBeGreaterThan(0);
    expect(priced.sources.every((s) => /^https?:\/\//.test(s.url))).toBe(true);
    expect(priced.sources.some((s) => s.date !== "")).toBe(true);

    const calculatedAt = "2026-10-18T00:00:00.000Z";
    const estimate = buildEstimate({
      type: "house",
      inputs: serpong,
      priced,
      rules: { growth_property: 0.06 },
      calculatedAt,
    });
    expect(estimate.targetAtGoalDate).toBe(targetAtGoalDate(priced.targetToday, 0.06, 2));
    expect(estimate.targetAtGoalDate).toBe(Math.round(priced.targetToday * 1.06 ** 2));
  }, 120_000);
});
