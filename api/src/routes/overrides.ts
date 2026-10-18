import { Hono } from "hono";
import type { AuthEnv } from "../auth.js";
import { ruleIdParam, setOverrideBody } from "../schemas.js";
import { notImplemented } from "../stub.js";
import { parse, parseBody } from "../validate.js";

// Assumptions page endpoints (spec 13): set or clear one override, then recalculate.

export const overrides = new Hono<AuthEnv>();

overrides.put("/:ruleId", async (c) => {
  const { ruleId } = parse(c.req.param(), ruleIdParam);
  const body = await parseBody(c, setOverrideBody);
  return notImplemented(c, "set override", { ruleId, clears: body.value === null });
});

export const recalculate = new Hono<AuthEnv>();

// Re-run stages 5–6 for all active goals after override changes.
recalculate.post("/", (c) => notImplemented(c, "recalculate", { uid: c.get("user").uid }));
