import { buildEstimate, type EstimateResponse, mergeRules } from "@adidi/shared";
import { Hono } from "hono";
import type { AuthEnv } from "../auth.js";
import type { JsonModel } from "../gemini/client.js";
import type { GoalStore } from "../pricing/ports.js";
import { type PriceOptions, priceGoal } from "../pricing/price.js";
import { PromptNotImplementedError } from "../pricing/prompt.js";
import {
  analysisParams,
  createGoalBody,
  estimateGoalBody,
  idParam,
  setChoiceBody,
  updateGoalBody,
} from "../schemas.js";
import { notImplemented } from "../stub.js";
import { parse, parseBody, ValidationError } from "../validate.js";

// Goal endpoints from specs/01-contracts.md. Validation is real; the estimate endpoint is
// wired (spec 05); the other handlers are stubs until spec 10 wires them to Firestore.

/** What the estimate endpoint needs: the model, the goal store and a clock (fixed in tests). */
export interface EstimateDeps {
  model: JsonModel;
  store: GoalStore;
  pricing?: PriceOptions;
  now?: () => Date;
}

export function createGoalRoutes(estimate?: EstimateDeps) {
  const goals = new Hono<AuthEnv>();

  // Create a draft goal.
  goals.post("/", async (c) => {
    const body = await parseBody(c, createGoalBody);
    return notImplemented(c, "create goal", { uid: c.get("user").uid, type: body.type });
  });

  // Update inputs, pay preference or the user's own price.
  goals.patch("/:id", async (c) => {
    const { id } = parse(c.req.param(), idParam);
    const body = await parseBody(c, updateGoalBody);
    return notImplemented(c, "update goal", { id, fields: Object.keys(body) });
  });

  // Delete a goal. Must refuse with 409 while the goal is `analysing` (checked in Firestore).
  goals.delete("/:id", (c) => {
    const { id } = parse(c.req.param(), idParam);
    return notImplemented(c, "delete goal", { id });
  });

  // Run pricing (stage 1) on the form values sent and store the estimate on the goal
  // (specs/05-pricing.md). Never called automatically; the UI calls it on button press only.
  goals.post("/:id/estimate", async (c) => {
    const { id } = parse(c.req.param(), idParam);
    const body = await parseBody(c, estimateGoalBody);
    if (!estimate) return notImplemented(c, "estimate goal", { id, type: body.type });

    const uid = c.get("user").uid;
    const goal = await estimate.store.getGoal(uid, id);
    if (!goal) return c.json({ error: "not_found", message: "Goal not found" }, 404);
    if (goal.type !== body.type) {
      throw new ValidationError([{ path: "type", message: `This goal is a ${goal.type} goal` }]);
    }
    if (goal.status === "analysing") {
      return c.json(
        { error: "conflict", message: "The goal is being analysed; try again when it finishes" },
        409,
      );
    }

    let priced: Awaited<ReturnType<typeof priceGoal>>;
    try {
      priced = await priceGoal(body.type, body.inputs, estimate.model, estimate.pricing);
    } catch (error) {
      if (error instanceof PromptNotImplementedError) {
        return notImplemented(c, "estimate goal", { id, type: body.type });
      }
      throw error;
    }
    if (!priced.ok) {
      const response: EstimateResponse = { targetToday: null, message: priced.message };
      return c.json(response, 200);
    }

    const [rules, overrides] = await Promise.all([
      estimate.store.listRules(),
      estimate.store.listOverrides(uid),
    ]);
    const calculatedAt = (estimate.now ?? (() => new Date()))().toISOString();
    const result = buildEstimate({
      type: body.type,
      inputs: body.inputs,
      priced: priced.priced,
      rules: mergeRules(rules, overrides),
      calculatedAt,
    });
    // A fresh calculation replaces the whole estimate, including a userOverride typed for the
    // previous inputs; PATCH /goals/:id sets a new one.
    await estimate.store.setEstimate(uid, id, result, calculatedAt);
    const response: EstimateResponse = result;
    return c.json(response, 200);
  });

  // Set an action to committed / dismissed / undecided.
  goals.patch("/:id/analyses/:month/choices", async (c) => {
    const { id, month } = parse(c.req.param(), analysisParams);
    const body = await parseBody(c, setChoiceBody);
    return notImplemented(c, "set action choice", { id, month, actionId: body.actionId });
  });

  return goals;
}
