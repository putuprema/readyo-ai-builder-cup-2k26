import { Hono } from "hono";
import type { AuthEnv } from "../auth.js";
import { createRunBody } from "../schemas.js";
import { notImplemented } from "../stub.js";
import { parseBody } from "../validate.js";

// POST /runs: creates a RunStatus, sets the goals to `analysing`, enqueues one Cloud Task
// for the worker and returns the runId. Stub until spec 07.

export const runs = new Hono<AuthEnv>();

runs.post("/", async (c) => {
  const body = await parseBody(c, createRunBody);
  return notImplemented(c, "create run", { kind: body.kind, goalIds: body.goalIds });
});
