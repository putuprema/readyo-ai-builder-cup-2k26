import type { GoalInputs, GoalType, HouseInputs } from "@adidi/shared";
import { formatRupiah } from "@adidi/shared";

// Prompts for stage 1. The schema carries the field-level instructions; the prompt describes
// the goal the way the form captured it and the pricing rules (specs/05-pricing.md).
// House is M1; the car and wedding prompts are task 3 (M2).

export const PRICING_SYSTEM_INSTRUCTION = `You are a pricing researcher for an Indonesian personal finance planner. You estimate what a described goal costs today in Indonesia, in rupiah, from current listings and price guides found with Google Search, and you return JSON that matches the given schema exactly.

Rules:
- Search first. Use prices published in the last twelve months. Prefer listings and price guides for the exact area, type and size asked for; widen to the nearest comparable area or size only when nothing closer exists, and say so in "reasoning".
- "targetToday" is one representative price for the described goal, not an average of unrelated listings. "rangeLow" and "rangeHigh" are the realistic band seen for close matches, and "targetToday" must lie inside it.
- Indonesian prices are written as "Rp 1,35 M" or "Rp 1.350.000.000" (M = miliar = billion) and "Rp 850 jt" (jt = juta = million). Return every amount as an integer number of rupiah.
- "sources" lists only pages you actually used, with the URL and the date the page shows for the price or listing. Do not invent pages, titles or dates.
- If you cannot find any current price for a close enough match, return null for "targetToday", "rangeLow" and "rangeHigh", an empty "sources" list, and say what was missing in "reasoning".
- Write "reasoning" in plain English; keep Indonesian place names and currency as they are.
- Return only the JSON.`;

export class PromptNotImplementedError extends Error {
  constructor(readonly goalType: GoalType) {
    super(`Pricing for ${goalType} goals is not implemented yet`);
    this.name = "PromptNotImplementedError";
  }
}

/** The user prompt for a goal; throws PromptNotImplementedError for car and wedding (M2). */
export function pricingPrompt(type: GoalType, inputs: GoalInputs): string {
  switch (type) {
    case "house":
      return housePrompt(inputs as HouseInputs);
    case "car":
    case "wedding":
      throw new PromptNotImplementedError(type);
  }
}

export function housePrompt(inputs: HouseInputs): string {
  const kind = inputs.propertyType === "landed" ? "landed house" : "apartment";
  const market =
    inputs.market === "new"
      ? "new build sold by a developer (primary market)"
      : "secondary market (resale by the owner)";
  const lines = [
    `Find the current price of a ${kind} in ${inputs.area}, Indonesia, to buy in ${inputs.targetYear}.`,
    `- Market: ${market}.`,
  ];
  if (inputs.propertyType === "landed" && (inputs.landM2 || inputs.buildingM2)) {
    const land = inputs.landM2 ? `land ${inputs.landM2} m²` : "any land size";
    const building = inputs.buildingM2 ? `building ${inputs.buildingM2} m²` : "any building size";
    const shorthand =
      inputs.landM2 && inputs.buildingM2
        ? ` (listings write this as LT ${inputs.landM2} / LB ${inputs.buildingM2}, or "${inputs.buildingM2}/${inputs.landM2}")`
        : "";
    lines.push(`- Size: ${land}, ${building}${shorthand}.`);
  } else if (inputs.buildingM2) {
    lines.push(`- Size: about ${inputs.buildingM2} m² of floor area.`);
  }
  if (inputs.budgetRange) {
    const [low, high] = inputs.budgetRange;
    lines.push(
      `- The person has ${formatRupiah(low)} to ${formatRupiah(high)} in mind; use it only to pick among listings, not as the answer.`,
    );
  }
  lines.push(
    "- Price the property as listed today, before KPR interest, notary fees and taxes. Report a price today, not a forecast.",
  );
  return lines.join("\n");
}
