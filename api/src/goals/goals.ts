import {
  buildEstimate,
  type Estimate,
  type Goal,
  type GoalInputs,
  type GoalType,
  mergeRules,
  plainJson,
} from "@adidi/shared";
import type { CreateGoalBody, UpdateGoalBody } from "../schemas.js";
import { carInputs, houseInputs, weddingInputs } from "../schemas.js";
import { ValidationError } from "../validate.js";
import type { GoalWriteStore } from "./ports.js";

// POST /goals, PATCH /goals/:id, DELETE /goals/:id (specs/01-contracts.md, wired by spec 10).
// Drafts are created at the estimate step; the UI moves them to the documents step on
// Continue. Nothing here calls a model: the estimate endpoint is in ../routes/goals.ts.

export interface GoalDeps {
  store: GoalWriteStore;
  now?: () => Date;
  newGoalId?: () => string;
}

export type GoalOutcome =
  | { status: 200 | 201; body: Goal }
  | { status: 204; body: null }
  | { status: 404 | 409; body: { error: string; message: string } };

export async function createGoal(
  uid: string,
  body: CreateGoalBody,
  deps: GoalDeps,
): Promise<GoalOutcome> {
  const now = (deps.now ?? (() => new Date()))().toISOString();
  const goal: Goal = {
    id: (deps.newGoalId ?? defaultGoalId)(),
    type: body.type,
    status: "draft",
    draftStep: "estimate",
    payPreference: body.payPreference,
    inputs: body.inputs,
    createdAt: now,
    updatedAt: now,
  };
  await deps.store.createGoal(uid, plainJson(goal));
  return { status: 201, body: goal };
}

export async function updateGoal(
  uid: string,
  goalId: string,
  body: UpdateGoalBody,
  deps: GoalDeps,
): Promise<GoalOutcome> {
  const goal = await deps.store.getGoal(uid, goalId);
  if (!goal) return notFound();
  if (goal.status === "analysing") return analysing();

  const now = (deps.now ?? (() => new Date()))().toISOString();
  const next: Goal = { ...goal, updatedAt: now };

  if (body.inputs) {
    // Partial inputs are merged, then the whole object is checked against the goal's type.
    next.inputs = validateInputs(goal.type, { ...goal.inputs, ...body.inputs });
  }
  if (body.payPreference !== undefined) {
    if (goal.type === "wedding" && body.payPreference !== "none") {
      throw new ValidationError([
        { path: "payPreference", message: 'A wedding has no loan path; use "none"' },
      ]);
    }
    next.payPreference = body.payPreference;
  }
  if (body.draftStep !== undefined) {
    if (goal.status !== "draft") {
      return conflict("goal_status", "Only a draft has a draft step");
    }
    next.draftStep = body.draftStep;
  }
  if (body.userOverride !== undefined) {
    next.estimate = await applyOverride(uid, next, body.userOverride, now, deps.store);
  }

  await deps.store.replaceGoal(uid, plainJson(next));
  return { status: 200, body: plainJson(next) };
}

export async function deleteGoal(
  uid: string,
  goalId: string,
  deps: GoalDeps,
): Promise<GoalOutcome> {
  const goal = await deps.store.getGoal(uid, goalId);
  if (!goal) return notFound();
  if (goal.status === "analysing") return analysing();
  await deps.store.deleteGoal(uid, goalId);
  return { status: 204, body: null };
}

/**
 * The person's own price. With an AI estimate it is stored as `estimate.userOverride` (null
 * clears it). Without one (the search failed, or they skipped it) the typed price becomes the
 * estimate itself, with no sources and the growth rule applied, so the run has a target.
 */
async function applyOverride(
  uid: string,
  goal: Goal,
  userOverride: number | null,
  now: string,
  store: GoalWriteStore,
): Promise<Estimate | undefined> {
  if (goal.estimate) {
    const { userOverride: _, ...rest } = goal.estimate;
    return userOverride === null ? rest : { ...rest, userOverride };
  }
  if (userOverride === null) return undefined;
  const [rules, overrides] = await Promise.all([store.listRules(), store.listOverrides(uid)]);
  const estimate = buildEstimate({
    type: goal.type,
    inputs: goal.inputs,
    priced: {
      targetToday: userOverride,
      rangeLow: userOverride,
      rangeHigh: userOverride,
      sources: [],
    },
    rules: mergeRules(rules, overrides),
    calculatedAt: now,
  });
  return { ...estimate, userOverride };
}

function validateInputs(type: GoalType, merged: unknown): GoalInputs {
  const schema = type === "house" ? houseInputs : type === "car" ? carInputs : weddingInputs;
  const result = schema.safeParse(merged);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((i) => ({
        path: ["inputs", ...i.path.map(String)].join("."),
        message: i.message,
      })),
    );
  }
  return result.data;
}

function defaultGoalId(): string {
  return `goal_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function notFound(): GoalOutcome {
  return { status: 404, body: { error: "not_found", message: "Goal not found" } };
}

function analysing(): GoalOutcome {
  return conflict("goal_analysing", "The goal is being analysed; try again when it finishes");
}

function conflict(error: string, message: string): GoalOutcome {
  return { status: 409, body: { error, message } };
}
