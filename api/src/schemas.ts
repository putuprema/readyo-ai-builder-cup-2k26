import type {
  ActionChoice,
  CarInputs,
  GoalType,
  HouseInputs,
  PayPreference,
  RunKind,
  SourceKind,
  WeddingInputs,
} from "@adidi/shared";
import { MONTH_PATTERN } from "@adidi/shared";
import { z } from "zod";
import { GOAL_TYPES, PAY_PREFERENCES, RUN_KINDS, SOURCE_KINDS } from "./contracts.js";

// Request schemas for every endpoint in specs/01-contracts.md. Each schema that mirrors a
// shared type is checked against it with `satisfies`, so the two cannot drift apart.

const rupiah = z.number().int().nonnegative();
const year = z.number().int().min(2026).max(2100);
export const month = z.string().regex(MONTH_PATTERN, "Expected YYYY-MM");
export const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, "Expected an id");
const text = z.string().trim().min(1).max(200);
const budgetRange = z
  .tuple([rupiah, rupiah])
  .refine(([low, high]) => low <= high, "budgetRange must be [low, high]");

export const goalType = z.enum(GOAL_TYPES) satisfies z.ZodType<GoalType>;
export const payPreference = z.enum(PAY_PREFERENCES) satisfies z.ZodType<PayPreference>;
export const runKind = z.enum(RUN_KINDS) satisfies z.ZodType<RunKind>;
export const sourceKind = z.enum(SOURCE_KINDS) satisfies z.ZodType<SourceKind>;
export const actionChoice = z.enum([
  "undecided",
  "committed",
  "dismissed",
]) satisfies z.ZodType<ActionChoice>;

export const houseInputs = z
  .object({
    area: text,
    propertyType: z.enum(["landed", "apartment"]),
    landM2: z.number().positive().optional(),
    buildingM2: z.number().positive().optional(),
    budgetRange: budgetRange.optional(),
    market: z.enum(["new", "secondary"]),
    firstHome: z.boolean(),
    targetYear: year,
    plannedDp: rupiah.optional(),
    joint: z.enum(["not_married", "joint", "single_applicant"]).optional(),
    preferredTenorYears: z.number().int().positive().optional(),
  })
  .strict() satisfies z.ZodType<HouseInputs>;

export const carInputs = z
  .object({
    condition: z.enum(["new", "used"]),
    modelOrSegment: text,
    budgetRange: budgetRange.optional(),
    city: text,
    targetYear: year,
    plannedDp: rupiah.optional(),
    tradeInValue: rupiah.optional(),
    preferredTenorYears: z.number().int().positive().optional(),
  })
  .strict() satisfies z.ZodType<CarInputs>;

export const weddingInputs = z
  .object({
    targetMonth: month,
    city: text,
    guests: z.number().int().positive().max(10_000),
    scale: z.enum(["intimate", "standard", "large"]),
    partnerShare: rupiah,
    familyContribution: rupiah,
    honeymoon: z.enum(["no", "domestic", "abroad"]),
    honeymoonBudget: rupiah.optional(),
  })
  .strict() satisfies z.ZodType<WeddingInputs>;

/** POST /goals: the goal type decides which inputs shape applies. */
export const createGoalBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("house"), payPreference, inputs: houseInputs }),
  z.object({ type: z.literal("car"), payPreference, inputs: carInputs }),
  z.object({ type: z.literal("wedding"), payPreference: z.literal("none"), inputs: weddingInputs }),
]);
export type CreateGoalBody = z.infer<typeof createGoalBody>;

/**
 * POST /goals/:id/estimate: the exact form values on screen (specs/05-pricing.md stores them
 * as `inputsUsed`), which may be newer than the saved draft. The type must match the goal's.
 */
export const estimateGoalBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("house"), inputs: houseInputs }).strict(),
  z.object({ type: z.literal("car"), inputs: carInputs }).strict(),
  z.object({ type: z.literal("wedding"), inputs: weddingInputs }).strict(),
]);
export type EstimateGoalBody = z.infer<typeof estimateGoalBody>;

/**
 * PATCH /goals/:id. The goal's type is only known from Firestore, so partial inputs are
 * accepted for any goal type here and matched against the stored type by the handler.
 */
export const updateGoalBody = z
  .object({
    inputs: z
      .union([houseInputs.partial(), carInputs.partial(), weddingInputs.partial()])
      .optional(),
    payPreference: payPreference.optional(),
    userOverride: rupiah.positive().nullable().optional(), // null clears the user's own price
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, "Nothing to update");
export type UpdateGoalBody = z.infer<typeof updateGoalBody>;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;

/** POST /uploads: metadata for one file; the file itself goes to the signed URL. */
export const createUploadBody = z
  .object({
    name: z.string().trim().min(1).max(255),
    type: z.enum(ACCEPTED_MIME_TYPES),
    size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
    sourceKind,
    month,
  })
  .strict();
export type CreateUploadBody = z.infer<typeof createUploadBody>;

/** POST /runs */
export const createRunBody = z
  .object({
    kind: runKind,
    goalIds: z.array(id).min(1).max(20),
    month,
    documentIds: z.array(id).max(50).optional(),
  })
  .strict()
  .refine(
    (b) => b.kind !== "first" || (b.documentIds?.length ?? 0) > 0,
    "A first run needs at least one document",
  );
export type CreateRunBody = z.infer<typeof createRunBody>;

/** PATCH /goals/:id/analyses/:month/choices */
export const setChoiceBody = z.object({ actionId: id, choice: actionChoice }).strict();
export type SetChoiceBody = z.infer<typeof setChoiceBody>;

/** PUT /overrides/:ruleId: null clears the override. */
export const setOverrideBody = z.object({ value: z.number().finite().nullable() }).strict();
export type SetOverrideBody = z.infer<typeof setOverrideBody>;

export const idParam = z.object({ id });
export const docIdParam = z.object({ docId: id });
export const ruleIdParam = z.object({ ruleId: id });
export const analysisParams = z.object({ id, month });
