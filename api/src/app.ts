import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { DeleteDataDeps } from "./account/delete-data.js";
import { type AuthEnv, requireAuth, type TokenVerifier } from "./auth.js";
import type { SetChoiceDeps } from "./choices/set-choice.js";
import type { GoalDeps } from "./goals/goals.js";
import { createGoalRoutes, type EstimateDeps } from "./routes/goals.js";
import { createMeRoutes } from "./routes/me.js";
import { overrides, recalculate } from "./routes/overrides.js";
import { createRunRoutes } from "./routes/runs.js";
import { createUploadRoutes } from "./routes/uploads.js";
import type { CreateRunDeps } from "./runs/create-run.js";
import type { UploadDeps } from "./uploads/uploads.js";
import { ValidationError } from "./validate.js";

export interface AppOptions {
  verifyToken: TokenVerifier;
  version?: string;
  /** Extra browser origins allowed by CORS, besides localhost and Firebase Hosting. */
  corsOrigins?: string[];
  /** Model and store for POST /goals/:id/estimate; without them the endpoint answers 501. */
  estimate?: EstimateDeps;
  /** Store and queue for POST /runs; without them the endpoint answers 501. */
  runs?: CreateRunDeps;
  /** Store for PATCH /goals/:id/analyses/:month/choices; without it the endpoint answers 501. */
  choices?: SetChoiceDeps;
  /** Store for POST /goals, PATCH /goals/:id and DELETE /goals/:id; without it they answer 501. */
  goals?: GoalDeps;
  /** Store, bucket and mode for the upload endpoints; without them they answer 501. */
  uploads?: UploadDeps;
  /** Store and bucket for DELETE /me/data; without them it answers 501. */
  account?: DeleteDataDeps;
  log?: boolean;
}

export function createApp(options: AppOptions) {
  const allowed = options.corsOrigins ?? [];
  const isAllowedOrigin = (origin: string) =>
    allowed.includes(origin) ||
    /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.(web\.app|firebaseapp\.com)$/.test(origin);

  const app = new Hono<AuthEnv>();

  if (options.log !== false) app.use(logger());
  app.use(
    "*",
    cors({
      origin: (origin) => (isAllowedOrigin(origin) ? origin : null),
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type"],
    }),
  );

  app.get("/health", (c) =>
    c.json({ ok: true, service: "api", version: options.version ?? "dev" }),
  );

  // Everything below needs a Firebase ID token.
  const auth = requireAuth(options.verifyToken);
  app.use("/goals/*", auth);
  app.use("/goals", auth);
  app.use("/uploads/*", auth);
  app.use("/uploads", auth);
  app.use("/runs", auth);
  app.use("/overrides/*", auth);
  app.use("/recalculate", auth);
  app.use("/me/*", auth);

  app.route("/goals", createGoalRoutes(options.estimate, options.choices, options.goals));
  app.route("/uploads", createUploadRoutes(options.uploads));
  app.route("/runs", createRunRoutes(options.runs));
  app.route("/overrides", overrides);
  app.route("/recalculate", recalculate);
  app.route("/me", createMeRoutes(options.account));

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((err, c) => {
    if (err instanceof ValidationError) {
      return c.json({ error: "invalid_request", issues: err.issues }, 400);
    }
    console.error(err);
    return c.json({ error: "internal" }, 500);
  });

  return app;
}
