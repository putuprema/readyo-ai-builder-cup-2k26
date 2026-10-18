import { Hono } from "hono";
import { logger } from "hono/logger";
import { z } from "zod";
import type { TaskVerifier } from "./auth.js";
import { type PipelineDeps, runPipeline } from "./runner.js";

// The worker's HTTP surface: /health and POST /runs, the endpoint Cloud Tasks invokes with an
// OIDC token (specs/07-pipeline-runs.md). The worker is never called from the browser, so
// there is no CORS on purpose.

export interface WorkerAppOptions {
  verifyTask: TaskVerifier;
  pipeline: PipelineDeps;
  version?: string;
  log?: boolean;
}

const runTaskBody = z
  .object({
    uid: z.string().min(1).max(128),
    runId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  })
  .strict();

/** Cloud Tasks sends the retry count of the task; 0 on the first attempt. */
export const RETRY_COUNT_HEADER = "X-CloudTasks-TaskRetryCount";

export function createWorkerApp(options: WorkerAppOptions) {
  const app = new Hono();
  if (options.log !== false) app.use(logger());

  app.get("/health", (c) =>
    c.json({ ok: true, service: "worker", version: options.version ?? "dev" }),
  );

  app.post("/runs", async (c) => {
    const verification = await options.verifyTask(c.req.header("Authorization"));
    if (!verification.ok) {
      return c.json({ error: "unauthorized", message: verification.reason }, 401);
    }
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_request", message: "Body must be valid JSON" }, 400);
    }
    const parsed = runTaskBody.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          error: "invalid_request",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        400,
      );
    }
    const attempt = Number(c.req.header(RETRY_COUNT_HEADER) ?? "0") || 0;
    const outcome = await runPipeline(parsed.data, attempt, options.pipeline);
    return c.json(outcome.body, outcome.status);
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal" }, 500);
  });
  return app;
}
