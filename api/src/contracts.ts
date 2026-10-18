import type { GoalType, PayPreference, RunKind, SourceKind } from "@adidi/shared";

// Runtime lists of the shared union types, so request validation and the types stay in step.
// The `satisfies` checks fail to compile if a member is added to the union but not here.

export const GOAL_TYPES = ["house", "car", "wedding"] as const satisfies readonly GoalType[];
export const PAY_PREFERENCES = ["cash", "loan", "none"] as const satisfies readonly PayPreference[];
export const RUN_KINDS = [
  "first",
  "monthly",
  "reuse",
  "recalculate",
] as const satisfies readonly RunKind[];
export const SOURCE_KINDS = [
  "bank",
  "ewallet",
  "paylater",
  "pinjol",
  "investment",
] as const satisfies readonly SourceKind[];
