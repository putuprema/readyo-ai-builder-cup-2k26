import { serve } from "@hono/node-server";
import { firestoreRunStore } from "./infra/firebase.js";
import { createWorkerApp } from "./pipeline/app.js";
import { taskVerifierFromEnv } from "./pipeline/auth.js";

const VERSION = process.env.GIT_SHA ?? "dev";
const PORT = Number(process.env.PORT ?? 8081);

// Cloud Tasks invokes POST /runs with an OIDC token (specs/07-pipeline-runs.md). The runners
// for each kind of run are wired here as the stages land.
const app = createWorkerApp({
  verifyTask: taskVerifierFromEnv(),
  version: VERSION,
  pipeline: { store: firestoreRunStore(), runners: {} },
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`worker listening on http://localhost:${info.port} (version ${VERSION})`);
});
