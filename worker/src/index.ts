import { serve } from "@hono/node-server";
import { createGeminiModel } from "./gemini/client.js";
import { cloudStorage, firestoreRecords, firestoreRunStore } from "./infra/firebase.js";
import { createWorkerApp } from "./pipeline/app.js";
import { taskVerifierFromEnv } from "./pipeline/auth.js";
import { createRunners } from "./pipeline/kinds.js";

const VERSION = process.env.GIT_SHA ?? "dev";
const PORT = Number(process.env.PORT ?? 8081);

// Cloud Tasks invokes POST /runs with an OIDC token (specs/07-pipeline-runs.md). Without a
// Gemini key the endpoint answers but every run fails with "not available".
const runners = process.env.GEMINI_API_KEY
  ? createRunners({
      storage: cloudStorage(),
      records: firestoreRecords(),
      model: createGeminiModel(),
    })
  : {};
if (!process.env.GEMINI_API_KEY) console.warn("GEMINI_API_KEY is not set: runs are off");

const app = createWorkerApp({
  verifyTask: taskVerifierFromEnv(),
  version: VERSION,
  pipeline: { store: firestoreRunStore(), runners },
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`worker listening on http://localhost:${info.port} (version ${VERSION})`);
});
