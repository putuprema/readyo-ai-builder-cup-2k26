import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { type AuthEnv, requireAuth, type TokenVerifier } from "./auth.js";
import { goals } from "./routes/goals.js";
import { overrides, recalculate } from "./routes/overrides.js";
import { runs } from "./routes/runs.js";
import { uploads } from "./routes/uploads.js";
import { ValidationError } from "./validate.js";

export interface AppOptions {
  verifyToken: TokenVerifier;
  version?: string;
  /** Extra browser origins allowed by CORS, besides localhost and Firebase Hosting. */
  corsOrigins?: string[];
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

  app.route("/goals", goals);
  app.route("/uploads", uploads);
  app.route("/runs", runs);
  app.route("/overrides", overrides);
  app.route("/recalculate", recalculate);

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
