import { z } from "zod";

// Response schema for stage 1 (specs/05-pricing.md, task 1). Gemini returns exactly this
// shape with structured output; code validates it, checks the target sits in its range and
// that at least one source has a URL, then computes the growth (shared/src/estimate.ts).

const rupiah = z.number().int().describe("Integer amount in rupiah, no decimals, no separators");

export const pricedSourceSchema = z.object({
  title: z.string().describe("Page or listing title, as published"),
  url: z.string().describe("The page's URL"),
  date: z
    .string()
    .describe(
      'When the price was published or last updated, as "YYYY-MM-DD" or "YYYY-MM"; an empty string when the page shows no date',
    ),
});

export const pricedGoalResponseSchema = z.object({
  targetToday: rupiah
    .nullable()
    .describe(
      "A single representative price today in rupiah for the goal as described, or null when no current listing or price guide matching the description was found",
    ),
  rangeLow: rupiah
    .nullable()
    .describe("The lowest realistic price seen for a close match, in rupiah; null when unknown"),
  rangeHigh: rupiah
    .nullable()
    .describe("The highest realistic price seen for a close match, in rupiah; null when unknown"),
  sources: z
    .array(pricedSourceSchema)
    .describe("The pages the prices came from; empty when nothing usable was found"),
  reasoning: z
    .string()
    .describe(
      "One or two plain sentences on how the price was chosen, naming the area and the listing type; or why nothing was found",
    ),
});

export type PricedGoalResponse = z.infer<typeof pricedGoalResponseSchema>;
export type PricedSource = z.infer<typeof pricedSourceSchema>;

/** The schema in the subset Gemini's `responseJsonSchema` accepts. */
export function pricedGoalResponseJsonSchema(): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(pricedGoalResponseSchema, {
    target: "draft-2020-12",
    io: "output",
  });
  return toGeminiSubset(rest) as Record<string, unknown>;
}

// Same conversion as the worker's extraction schemas: nullable fields become anyOf with null,
// and zod's safe-integer bounds are dropped.
function toGeminiSubset(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSubset);
  if (!node || typeof node !== "object") return node;
  const record = node as Record<string, unknown>;

  if (Array.isArray(record.type) && record.type.length === 2 && record.type[1] === "null") {
    const { type, description, title, ...constraints } = record;
    const outer: Record<string, unknown> = {};
    if (description !== undefined) outer.description = description;
    if (title !== undefined) outer.title = title;
    outer.anyOf = [toGeminiSubset({ ...constraints, type: type[0] }), { type: "null" }];
    return outer;
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const isSafeIntBound =
      (key === "minimum" || key === "maximum") &&
      Math.abs(value as number) === Number.MAX_SAFE_INTEGER;
    if (isSafeIntBound) continue;
    out[key] =
      key === "properties"
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([k, v]) => [
              k,
              toGeminiSubset(v),
            ]),
          )
        : toGeminiSubset(value);
  }
  return out;
}
