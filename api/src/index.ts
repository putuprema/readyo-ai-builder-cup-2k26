import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { verifyFirebaseIdToken } from "./firebase.js";
import { createGeminiModel, hasGeminiKey } from "./gemini/client.js";
import { firestoreGoals } from "./infra/firestore.js";
import { pricingTier } from "./pricing/price.js";

const VERSION = process.env.GIT_SHA ?? "dev";
const PORT = Number(process.env.PORT ?? 8080);

// Browser origins allowed to call this service, besides localhost and Firebase Hosting
// (*.web.app / *.firebaseapp.com), which are always allowed.
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Goal pricing needs a Gemini key; without one the estimate endpoint answers 501 and says so.
if (!hasGeminiKey()) console.warn("GEMINI_API_KEY is not set: POST /goals/:id/estimate is off");

const app = createApp({
  verifyToken: verifyFirebaseIdToken,
  version: VERSION,
  corsOrigins: CORS_ORIGINS,
  estimate: hasGeminiKey()
    ? { model: createGeminiModel(), store: firestoreGoals(), pricing: { tier: pricingTier() } }
    : undefined,
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port} (version ${VERSION})`);
});
