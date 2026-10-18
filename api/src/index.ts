import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { verifyFirebaseIdToken } from "./firebase.js";
import { createGeminiModel, hasGeminiKey } from "./gemini/client.js";
import {
  firestoreAnalyses,
  firestoreGoals,
  firestoreGoalWrites,
  firestoreRuns,
  firestoreUploads,
  firestoreUserData,
} from "./infra/firestore.js";
import { cloudStorageUploads, cloudStorageUserFiles } from "./infra/storage.js";
import { taskQueueFromEnv } from "./infra/tasks.js";
import { pricingTier } from "./pricing/price.js";
import { uploadModeFromEnv } from "./uploads/uploads.js";

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

// Uploads need the default bucket; with the Storage emulator the api proxies the bytes itself.
const uploadMode = uploadModeFromEnv();
if (!process.env.STORAGE_BUCKET) console.warn("STORAGE_BUCKET is not set: /uploads is off");
if (uploadMode === "proxy")
  console.warn("Storage emulator detected: PUT /uploads/:docId/content is on");

// Runs need the worker's URL and a task queue (Cloud Tasks, or TASKS_MODE=direct locally).
const queue = taskQueueFromEnv();
if (!queue) console.warn("WORKER_URL is not set: POST /runs is off");

const app = createApp({
  verifyToken: verifyFirebaseIdToken,
  version: VERSION,
  corsOrigins: CORS_ORIGINS,
  estimate: hasGeminiKey()
    ? { model: createGeminiModel(), store: firestoreGoals(), pricing: { tier: pricingTier() } }
    : undefined,
  runs: queue ? { store: firestoreRuns(), queue } : undefined,
  choices: { store: firestoreAnalyses() },
  goals: { store: firestoreGoalWrites() },
  uploads: process.env.STORAGE_BUCKET
    ? { store: firestoreUploads(), storage: cloudStorageUploads(), mode: uploadMode }
    : undefined,
  account: {
    store: firestoreUserData(),
    files: process.env.STORAGE_BUCKET ? cloudStorageUserFiles() : undefined,
  },
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port} (version ${VERSION})`);
});
