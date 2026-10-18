import type { HouseInputs } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { groundingOf, ModelError } from "../gemini/client.js";
import { FakeModel } from "./fakes.js";
import {
  acceptPricedResponse,
  NO_SOURCE_MESSAGE,
  normalizeDate,
  priceGoal,
  pricingTier,
} from "./price.js";
import { housePrompt, PromptNotImplementedError } from "./prompt.js";
import { pricedGoalResponseJsonSchema } from "./schemas.js";

// specs/05-pricing.md task 1 (house prompt, schema) and task 4 (failure path), offline.

const serpong: HouseInputs = {
  area: "Serpong",
  propertyType: "landed",
  landM2: 70,
  buildingM2: 90,
  market: "new",
  firstHome: true,
  targetYear: 2028,
};

const goodAnswer = {
  targetToday: 1_350_000_000,
  rangeLow: 1_100_000_000,
  rangeHigh: 1_600_000_000,
  sources: [
    {
      title: "Rumah123: rumah baru Serpong 70/90",
      url: "https://www.rumah123.com/x",
      date: "2026-10-02",
    },
    { title: "", url: "https://www.lamudi.co.id/y", date: "Oct 2026" },
    { title: "no url", url: "", date: "2026-09" },
  ],
  reasoning: "Cluster listings in Serpong for 70/90 m² new landed houses run Rp 1.1 to 1.6 bn.",
};

describe("housePrompt", () => {
  it("names the area, type, size, market and target year", () => {
    const prompt = housePrompt(serpong);
    expect(prompt).toContain("landed house in Serpong");
    expect(prompt).toContain("2028");
    expect(prompt).toContain("new build sold by a developer");
    expect(prompt).toContain("LT 70 / LB 90");
  });

  it("mentions the budget only as a hint and handles apartments without sizes", () => {
    const prompt = housePrompt({
      ...serpong,
      propertyType: "apartment",
      landM2: undefined,
      buildingM2: undefined,
      market: "secondary",
      budgetRange: [800_000_000, 1_200_000_000],
    });
    expect(prompt).toContain("apartment in Serpong");
    expect(prompt).toContain("secondary market");
    expect(prompt).toContain("Rp 800 m to Rp 1.2 bn");
    expect(prompt).not.toContain("Size:");
  });
});

describe("pricedGoalResponseJsonSchema", () => {
  it("is a Gemini-compatible object schema with nullable prices", () => {
    const schema = pricedGoalResponseJsonSchema() as {
      type: string;
      properties: Record<string, { anyOf?: unknown[] }>;
      required: string[];
    };
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual([
      "targetToday",
      "rangeLow",
      "rangeHigh",
      "sources",
      "reasoning",
    ]);
    expect(schema.properties.targetToday.anyOf).toEqual([
      expect.objectContaining({ type: "integer" }),
      { type: "null" },
    ]);
    expect(JSON.stringify(schema)).not.toContain("9007199254740991");
  });
});

describe("priceGoal", () => {
  it("asks the Flash tier with search grounding and returns the validated price", async () => {
    const model = FakeModel.returning(goodAnswer);
    const result = await priceGoal("house", serpong, model);
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0]).toMatchObject({ tier: "flash", googleSearch: true });
    expect(model.requests[0]?.prompt).toContain("Serpong");
    expect(result).toEqual({
      ok: true,
      priced: {
        targetToday: 1_350_000_000,
        rangeLow: 1_100_000_000,
        rangeHigh: 1_600_000_000,
        sources: [
          {
            title: "Rumah123: rumah baru Serpong 70/90",
            url: "https://www.rumah123.com/x",
            date: "2026-10-02",
          },
          { title: "www.lamudi.co.id", url: "https://www.lamudi.co.id/y", date: "" },
        ],
      },
      reasoning: goodAnswer.reasoning,
    });
  });

  it("uses the Pro tier only when asked", async () => {
    const model = FakeModel.returning(goodAnswer);
    await priceGoal("house", serpong, model, { tier: "pro" });
    expect(model.requests[0]?.tier).toBe("pro");
    expect(pricingTier({ PRICING_MODEL_TIER: "pro" })).toBe("pro");
    expect(pricingTier({})).toBe("flash");
  });

  it("returns the no-source message when the model found nothing", async () => {
    const model = FakeModel.returning({
      targetToday: null,
      rangeLow: null,
      rangeHigh: null,
      sources: [],
      reasoning: "No listings for that size in that area.",
    });
    expect(await priceGoal("house", serpong, model)).toEqual({
      ok: false,
      message: NO_SOURCE_MESSAGE,
    });
  });

  it("returns a message, not an exception, when the model call fails or answers nonsense", async () => {
    const failing = FakeModel.throwing(new ModelError("api_error", "Gemini API error 503"));
    const failed = await priceGoal("house", serpong, failing);
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.message).toMatch(/did not complete/);

    const nonsense = FakeModel.returning({ price: "1.35 M" });
    expect((await priceGoal("house", serpong, nonsense)).ok).toBe(false);
  });

  it("rethrows unexpected errors", async () => {
    const model = FakeModel.throwing(new TypeError("boom"));
    await expect(priceGoal("house", serpong, model)).rejects.toThrow(TypeError);
  });

  it("has no prompt for car and wedding goals yet (M2)", async () => {
    const model = FakeModel.returning(goodAnswer);
    await expect(
      priceGoal(
        "car",
        { condition: "new", modelOrSegment: "LCGC", city: "Jakarta", targetYear: 2027 },
        model,
      ),
    ).rejects.toThrow(PromptNotImplementedError);
    expect(model.requests).toHaveLength(0);
  });
});

describe("acceptPricedResponse", () => {
  const base = { ...goodAnswer, sources: [goodAnswer.sources[0]] };

  it("rejects a price that is not inside its own range", () => {
    const result = acceptPricedResponse({ ...base, rangeLow: 1_400_000_000 });
    expect(result.ok).toBe(false);
  });

  it("widens a missing range to the price and swaps an inverted one", () => {
    expect(acceptPricedResponse({ ...base, rangeLow: null, rangeHigh: null })).toMatchObject({
      ok: true,
      priced: { rangeLow: 1_350_000_000, rangeHigh: 1_350_000_000 },
    });
    expect(
      acceptPricedResponse({ ...base, rangeLow: 1_600_000_000, rangeHigh: 1_100_000_000 }),
    ).toMatchObject({ ok: true, priced: { rangeLow: 1_100_000_000, rangeHigh: 1_600_000_000 } });
  });

  it("treats a price without any source URL, or a non-positive price, as no source", () => {
    expect(
      acceptPricedResponse({ ...base, sources: [{ title: "x", url: "rumah123", date: "" }] }),
    ).toEqual({
      ok: false,
      message: NO_SOURCE_MESSAGE,
    });
    expect(acceptPricedResponse({ ...base, targetToday: 0 })).toEqual({
      ok: false,
      message: NO_SOURCE_MESSAGE,
    });
  });
});

describe("normalizeDate", () => {
  it("keeps YYYY-MM and YYYY-MM-DD, blanks anything else", () => {
    expect(normalizeDate("2026-10")).toBe("2026-10");
    expect(normalizeDate(" 2026-10-18 ")).toBe("2026-10-18");
    expect(normalizeDate("2026-13")).toBe("");
    expect(normalizeDate("October 2026")).toBe("");
  });
});

describe("groundingOf", () => {
  it("reads the queries and the web chunks, ignoring other chunk kinds", () => {
    expect(
      groundingOf({
        webSearchQueries: ["harga rumah serpong 70/90"],
        groundingChunks: [
          { web: { title: "rumah123.com", uri: "https://vertexaisearch.cloud.google.com/r/1" } },
          { retrievedContext: { title: "ignored" } },
        ],
      }),
    ).toEqual({
      queries: ["harga rumah serpong 70/90"],
      sources: [{ title: "rumah123.com", uri: "https://vertexaisearch.cloud.google.com/r/1" }],
    });
    expect(groundingOf(undefined)).toEqual({ queries: [], sources: [] });
  });
});
