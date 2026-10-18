import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";

const SERVICE = "worker";
const VERSION = process.env.GIT_SHA ?? "dev";
const PORT = Number(process.env.PORT ?? 8081);

// The worker is not called from the browser: Cloud Tasks invokes it with an OIDC token
// (spec 07). No CORS here on purpose.
const app = new Hono();

app.use(logger());

app.get("/health", (c) => c.json({ ok: true, service: SERVICE, version: VERSION }));

app.notFound((c) => c.json({ error: "not_found" }, 404));

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`${SERVICE} listening on http://localhost:${info.port} (version ${VERSION})`);
});
