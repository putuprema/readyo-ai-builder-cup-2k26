import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { verifyFirebaseIdToken } from "./firebase.js";

const VERSION = process.env.GIT_SHA ?? "dev";
const PORT = Number(process.env.PORT ?? 8080);

// Browser origins allowed to call this service, besides localhost and Firebase Hosting
// (*.web.app / *.firebaseapp.com), which are always allowed.
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = createApp({
  verifyToken: verifyFirebaseIdToken,
  version: VERSION,
  corsOrigins: CORS_ORIGINS,
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port} (version ${VERSION})`);
});
