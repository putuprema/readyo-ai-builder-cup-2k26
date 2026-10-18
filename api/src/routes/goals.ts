import { Hono } from "hono";
import type { AuthEnv } from "../auth.js";
import {
  analysisParams,
  createGoalBody,
  idParam,
  setChoiceBody,
  updateGoalBody,
} from "../schemas.js";
import { notImplemented } from "../stub.js";
import { parse, parseBody } from "../validate.js";

// Goal endpoints from specs/01-contracts.md. Validation is real; the handlers are stubs
// until specs 05 (estimate) and 10 (goal creation) wire them to Firestore.

export const goals = new Hono<AuthEnv>();

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

// Run pricing (stage 1) and store the estimate.
goals.post("/:id/estimate", (c) => {
  const { id } = parse(c.req.param(), idParam);
  return notImplemented(c, "estimate goal", { id });
});

// Set an action to committed / dismissed / undecided.
goals.patch("/:id/analyses/:month/choices", async (c) => {
  const { id, month } = parse(c.req.param(), analysisParams);
  const body = await parseBody(c, setChoiceBody);
  return notImplemented(c, "set action choice", { id, month, actionId: body.actionId });
});
