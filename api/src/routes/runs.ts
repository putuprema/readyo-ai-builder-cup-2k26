import { Hono } from "hono";
import type { AuthEnv } from "../auth.js";
import { type CreateRunDeps, createRun } from "../runs/create-run.js";
import { createRunBody } from "../schemas.js";
import { notImplemented } from "../stub.js";
import { parseBody } from "../validate.js";

// POST /runs: creates a RunStatus, sets the goals to `analysing`, enqueues one Cloud Task
// for the worker and returns the runId (specs/07-pipeline-runs.md). Without the store and the
// queue (no WORKER_URL configured) the endpoint answers 501.

export function createRunRoutes(deps?: CreateRunDeps) {
  const runs = new Hono<AuthEnv>();

  runs.post("/", async (c) => {
    const body = await parseBody(c, createRunBody);
    if (!deps) return notImplemented(c, "create run", { kind: body.kind, goalIds: body.goalIds });
    const outcome = await createRun(c.get("user").uid, body, deps);
    return c.json(outcome.body, outcome.status);
  });

  return runs;
}
