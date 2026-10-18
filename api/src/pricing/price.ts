import type { GoalInputs, GoalType, PricedGoal } from "@adidi/shared";
import type { JsonModel, ModelTier } from "../gemini/client.js";
import { ModelError } from "../gemini/client.js";
import { PRICING_SYSTEM_INSTRUCTION, pricingPrompt } from "./prompt.js";
import {
  type PricedGoalResponse,
  pricedGoalResponseJsonSchema,
  pricedGoalResponseSchema,
} from "./schemas.js";

// Stage 1 for one goal: ask Gemini for today's price with Google Search grounding, validate the
// answer and hand back the priced goal, or a user-facing reason why there is none. The growth
// to the goal date is not computed here (shared/src/estimate.ts does it over the rules table).

export type PriceResult =
  | { ok: true; priced: PricedGoal; reasoning: string }
  | { ok: false; message: string };

/** The message the UI shows when search found nothing usable; the price field stays editable. */
export const NO_SOURCE_MESSAGE =
  "We could not find a current price for this description. Type the price you have in mind to continue.";

const MODEL_FAILURE_MESSAGE =
  "The price search did not complete. Try again in a moment, or type the price you have in mind to continue.";

export interface PriceOptions {
  /** Model tier for the search call. Flash by default: measured on the Serpong house it answered
   *  in 23 s with page-level listing URLs and dates, where Pro took 52 s and cited homepages. */
  tier?: ModelTier;
}

/** The tier from the environment (PRICING_MODEL_TIER=pro|flash), Flash when unset. */
export function pricingTier(env: { PRICING_MODEL_TIER?: string } = process.env): ModelTier {
  return env.PRICING_MODEL_TIER === "pro" ? "pro" : "flash";
}

export async function priceGoal(
  type: GoalType,
  inputs: GoalInputs,
  model: JsonModel,
  options: PriceOptions = {},
): Promise<PriceResult> {
  const prompt = pricingPrompt(type, inputs); // throws PromptNotImplementedError for M2 goals
  let raw: unknown;
  try {
    const result = await model.generateJson({
      tier: options.tier ?? "flash",
      systemInstruction: PRICING_SYSTEM_INSTRUCTION,
      prompt,
      responseJsonSchema: pricedGoalResponseJsonSchema(),
      googleSearch: true,
    });
    raw = result.json;
  } catch (error) {
    if (error instanceof ModelError) return { ok: false, message: MODEL_FAILURE_MESSAGE };
    throw error;
  }
  const parsed = pricedGoalResponseSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: MODEL_FAILURE_MESSAGE };
  return acceptPricedResponse(parsed.data);
}

/**
 * Pure acceptance rules over a validated model answer (exported for tests):
 * - a usable source is one with an http(s) URL; without at least one the answer is "no source";
 * - the price must be present and positive, with a range around it; a missing or inverted
 *   range is widened to the price itself rather than rejected;
 * - the price must lie inside its range, otherwise the answer is not trusted.
 */
export function acceptPricedResponse(data: PricedGoalResponse): PriceResult {
  const sources = data.sources
    .filter((s) => /^https?:\/\/\S+$/i.test(s.url.trim()))
    .map((s) => ({
      title: s.title.trim() || hostOf(s.url),
      url: s.url.trim(),
      date: normalizeDate(s.date),
    }));
  if (sources.length === 0 || data.targetToday === null || data.targetToday <= 0) {
    return { ok: false, message: NO_SOURCE_MESSAGE };
  }
  const targetToday = data.targetToday;
  let rangeLow = data.rangeLow ?? targetToday;
  let rangeHigh = data.rangeHigh ?? targetToday;
  if (rangeLow > rangeHigh) [rangeLow, rangeHigh] = [rangeHigh, rangeLow];
  if (targetToday < rangeLow || targetToday > rangeHigh) {
    return { ok: false, message: MODEL_FAILURE_MESSAGE };
  }
  return {
    ok: true,
    priced: { targetToday, rangeLow, rangeHigh, sources },
    reasoning: data.reasoning.trim(),
  };
}

/** "YYYY-MM-DD" and "YYYY-MM" pass through; anything else becomes an empty string (no date). */
export function normalizeDate(date: string): string {
  const trimmed = date.trim();
  return /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/.test(trimmed) ? trimmed : "";
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
