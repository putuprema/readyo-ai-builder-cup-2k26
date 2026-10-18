import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const SERVICE = "api";
const VERSION = process.env.GIT_SHA ?? "dev";
const PORT = Number(process.env.PORT ?? 8080);

// Browser origins allowed to call this service. The web app runs on Firebase Hosting
// (*.web.app / *.firebaseapp.com) in production and on localhost in development.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return /^https:\/\/[a-z0-9-]+\.(web\.app|firebaseapp\.com)$/.test(origin);
}

const app = new Hono();

app.use(logger());
app.use(
  "*",
  cors({
    origin: (origin) => (isAllowedOrigin(origin) ? origin : null),
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
  }),
);

app.get("/health", (c) => c.json({ ok: true, service: SERVICE, version: VERSION }));

app.notFound((c) => c.json({ error: "not_found" }, 404));

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`${SERVICE} listening on http://localhost:${info.port} (version ${VERSION})`);
});
