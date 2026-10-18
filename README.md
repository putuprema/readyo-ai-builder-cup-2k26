# [APP NAME]

A financial readiness planner for Indonesians, built by team ADiDi for AI Builder Cup 2026 (BFSI theme). Pick a goal (house, car or wedding), upload one month of statements, and see how many months until a bank would approve you, what blocks you today, and a verified plan to get there sooner.

How we work: `AGENTS.md`. Specs: `specs/`. Background: `docs/`.

## Repository layout

| Folder                                    | What                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `shared/`                                 | Types and pure logic shared by web, api and worker (display formatting, later `simulate()`, metrics, rules). pnpm package `@adidi/shared`. |
| `web/`                                    | Next.js app, static export, served by Firebase Hosting.                                                                                    |
| `api/`                                    | Cloud Run service: uploads, goals, short requests.                                                                                         |
| `worker/`                                 | Cloud Run service: the analysis pipeline, triggered by Cloud Tasks.                                                                        |
| `scripts/`                                | Deploy scripts and the secrets check.                                                                                                      |
| `docs/`, `specs/`, `design/`, `fixtures/` | Product docs, feature specs, design handoff, test fixtures.                                                                                |

Everything is TypeScript in one pnpm workspace. One lockfile at the root.

## Prerequisites

- Node 26 (`.nvmrc`) and pnpm 10.28 (`npm install -g pnpm@10.28.0`; Node 26 no longer ships corepack).
- For deploys only: `gcloud` and `firebase` CLIs (see "Deploy"). Docker is not needed; images are built by Cloud Build.

### With Nix

If you use Nix, skip the installs above. `shell.nix` pins nixpkgs and provides Node 26, pnpm, firebase-tools and gcloud:

```bash
nix-shell
```

Run every command in this README inside that shell, including the deploy scripts. `firebase login` and `gcloud auth login` store their state in your home directory, so you log in once.

## Run locally

```bash
pnpm install
```

Each part has one command. Run them in separate terminals, or all at once with `pnpm dev` from the root.

| Part   | Command                            | Where                        |
| ------ | ---------------------------------- | ---------------------------- |
| web    | `pnpm --filter web dev`            | http://localhost:3000        |
| api    | `pnpm --filter api dev`            | http://localhost:8080/health |
| worker | `pnpm --filter worker dev`         | http://localhost:8081/health |
| shared | `pnpm --filter @adidi/shared test` | unit tests                   |
| rules  | `pnpm --filter firestore-tests test` | Firestore security rules tests on the emulator |

Copy each `.env.example` to `.env` where you need to override a default (none is required for the hello-world setup).

Checks from the root:

```bash
pnpm lint        # Biome: lint + format check
pnpm format      # Biome: write formatting
pnpm typecheck   # tsc in every package
pnpm test        # Vitest in every package that has tests (includes the rules tests, see below)
pnpm build       # builds shared, web (static export to web/out), api and worker
pnpm check:secrets   # fails if a credential is tracked by git
```

### The whole app on the emulators

```bash
pnpm emulators                      # Auth 9099, Firestore 8085, Storage 9199 (project demo-adidi); data kept in .firebase/emulator-data
```

With the emulators running, seed them once from another terminal (the `*:emulator` scripts start their own emulator instance, so they are for one-off runs only):

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 pnpm --filter api seed:rules
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 pnpm --filter api seed:demo   # demo@adidi.app, password demo-pass-2026 on the emulators unless DEMO_PASSWORD is set (the script reads api/.env, so a DEMO_PASSWORD there wins)
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 pnpm --filter api seed:demo --goals-list --empty-user   # adds one analysing, two draft and a second active goal, and empty@adidi.app with no goals (spec 12)
```

Then start the services against them. `web/.env`: `NEXT_PUBLIC_USE_EMULATORS=1`. `api/.env`: `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085`, `FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199`, `FIREBASE_PROJECT_ID=demo-adidi`, `STORAGE_BUCKET=demo-adidi.appspot.com`, `WORKER_URL=http://localhost:8081`, `TASKS_MODE=direct`, plus `GEMINI_API_KEY` for estimates. `worker/.env`: the same emulator hosts, project and bucket, `TASKS_AUTH=off` and `GEMINI_API_KEY`. Against the real Firebase project instead, fill in the `NEXT_PUBLIC_FIREBASE_*` values from `web/.env.example`.

### Firestore rules tests

`firestore.rules` is tested with `@firebase/rules-unit-testing` against the Firestore emulator (`firestore-tests/`). The suite clears the whole emulator database between cases, so never point it at the emulator you develop against (`pnpm emulators`): `pnpm --filter firestore-tests test` starts a throwaway instance of its own. The emulator is a jar, so it needs a Java runtime: `scripts/with-emulators.sh` uses `java` from the PATH, or the Homebrew OpenJDK (`brew install openjdk`), or macOS's `java_home`. The firebase CLI comes from the root dev dependencies; the first run downloads the emulator into `~/.cache/firebase/emulators`.

### Demo data

`pnpm seed:demo` creates the demo account (`demo@adidi.app`, uid `demo-user`) with an active house goal, one month of extracted data and its analysis, so the UI can be built before the pipeline exists. The data lives in `shared/src/demo/` and is tested for internal consistency; `api/scripts/seed-demo.ts` only writes it. Against the real project it needs Application Default Credentials (`gcloud auth application-default login`), `FIREBASE_PROJECT_ID` and `DEMO_PASSWORD`. Against the emulators, `pnpm seed:demo:emulator` needs nothing else. Re-running replaces the demo user's Firestore tree.

### Rules

`pnpm seed:rules` writes the rule defaults from `shared/rules/defaults.json` to the `rules` collection, one document per rule (`pnpm seed:rules:emulator` against the emulator). Only checked values are in that file; the rules still marked `[__]` in `specs/02-simulate.md` are left out until a source is checked, and `fixtures/profiles/rules-test.json` is test-only and never seeded. Re-running overwrites each rule document and lists any document that is no longer in the file.

## Secrets

Secrets never live in the repo. Locally, put them in a `.env` file (ignored by git). On Cloud Run, store them in Secret Manager and mount them as environment variables (`--set-secrets GEMINI_API_KEY=gemini-api-key:latest`). `pnpm check:secrets` greps the tracked files for API keys, private keys and service-account JSON.

## Deploy

### One-time GCP setup (by hand)

1. Create a GCP project with billing, and a Firebase project linked to it.
   Create the Firestore database in the same region as Cloud Run (`gcloud firestore databases create --location=asia-southeast1`): its location cannot be changed later, and a US database adds about 0.5–5 s to every api write from Singapore.
2. Enable the APIs: Cloud Run, Cloud Build, Artifact Registry, Cloud Tasks, Firestore, Cloud Storage, Secret Manager, and the Gemini API (or Vertex AI).
3. Create an Artifact Registry Docker repository in the region (default `adidi` in `asia-southeast1`):
   ```bash
   gcloud artifacts repositories create adidi --repository-format=docker --location=asia-southeast1
   ```
4. Install and log in to the CLIs (inside `nix-shell`, only the two login commands are needed):
   ```bash
   brew install --cask google-cloud-sdk
   npm install -g firebase-tools
   gcloud auth login && gcloud config set project YOUR_PROJECT_ID
   firebase login
   ```
5. Put the project ID (and region, if different) in `scripts/env.sh` and `.firebaserc`.
6. Create the Gemini API key secret and let Cloud Run read it. Both services run as the project's default compute service account, which cannot read secrets until it is granted the accessor role on this one:
   ```bash
   printf '%s' "YOUR_GEMINI_API_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=-
   PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format 'value(projectNumber)')
   gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
     --member "serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
     --role roles/secretmanager.secretAccessor
   ```
   Without the binding, `gcloud run deploy` fails with "Permission denied on secret ... for Revision service account".
7. Create the default Cloud Storage bucket (`YOUR_PROJECT_ID.firebasestorage.app`), which the uploads use. In the Firebase console: Storage > Get started, location `asia-southeast1`. Or from the CLI:
   ```bash
   gcloud services enable firebasestorage.googleapis.com
   curl -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "x-goog-user-project: YOUR_PROJECT_ID" \
     -H "Content-Type: application/json" -d '{"location":"asia-southeast1","storageClass":"STANDARD"}' \
     "https://firebasestorage.googleapis.com/v1alpha/projects/YOUR_PROJECT_ID/defaultBucket"
   ```
8. Register a Firebase web app and put its config in `web/.env.production.local` (git-ignored), which `next build` reads:
   ```bash
   firebase apps:create WEB adidi-web
   firebase apps:sdkconfig WEB <app id printed above>
   ```
   Copy `projectId`, `apiKey`, `authDomain` and `appId` into `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` and `NEXT_PUBLIC_FIREBASE_APP_ID`. These are public identifiers, but the key matches the `AIza…` pattern that `pnpm check:secrets` rejects, so they stay out of git.

### Deploy each part

Order matters the first time: the web build needs the api URL.

```bash
scripts/deploy-service.sh api       # Cloud Build image, deploy to Cloud Run, prints the service URL
scripts/deploy-service.sh worker    # same, not publicly reachable
# paste the api URL into API_URL in scripts/env.sh, then:
scripts/deploy-web.sh               # next build (static export) + firebase deploy --only hosting
```

Each service's `/health` returns `{ "ok": true, "service": "<name>", "version": "<git sha>" }`. The Hosting URL shows the placeholder page with the api's health response.

### Analysis runs (Cloud Tasks)

`POST /runs` on the api enqueues one Cloud Task per analysis; the task calls `POST /runs` on the worker with an OIDC token (`specs/07-pipeline-runs.md`). After the first worker deploy:

```bash
# paste the worker URL into WORKER_URL in scripts/env.sh, then:
scripts/setup-tasks.sh               # queue, invoker service account, IAM bindings (once)
scripts/deploy-service.sh api        # again, so the api knows WORKER_URL
```

Both services read `GEMINI_API_KEY` from the Secret Manager secret named in `GEMINI_SECRET` (`GEMINI_API_KEY` by default), created and shared with Cloud Run in step 6 of the one-time setup. The worker is deployed with a 30-minute request timeout because a first run takes a few minutes.

Locally, the api posts straight to the worker instead of Cloud Tasks: set `WORKER_URL=http://localhost:8081` and `TASKS_MODE=direct` in `api/.env`, and `TASKS_AUTH=off` in `worker/.env`.

### Uploads (signed URLs)

The documents step PUTs each statement straight to the default bucket through a V4 signed URL from `POST /uploads` (`specs/10-ui-goal-creation.md`). Two one-time steps after the first api deploy:

```bash
scripts/setup-storage.sh             # CORS on the bucket for browser PUTs, and roles/iam.serviceAccountTokenCreator so the api can sign
```

The api reads `STORAGE_BUCKET` (set by `scripts/deploy-service.sh`). On the emulators firebase-admin cannot sign, so with `FIREBASE_STORAGE_EMULATOR_HOST` set the api answers `POST /uploads` with a URL to its own `PUT /uploads/:docId/content`, which streams the bytes into the emulator bucket. That route exists in emulator mode only.

### Walk the house flow in the browser

With the emulators, the api (`WORKER_URL` pointing at the worker, `TASKS_MODE=direct`) and the worker running, and `web/.env` set to the emulators: open http://localhost:3000, sign in as the demo account, create a house goal (the form starts with a sample scenario), press Calculate Estimate (about 30 s), Continue, press **Use sample statements** on the documents step (it uploads the four PDFs in `web/public/samples/`, copies of `fixtures/statements/sample_*.pdf`), Submit, and watch the run reach `done` in the worker's log (about three minutes, mostly extraction). A fresh account (no profile yet) also goes through the profile modal, pre-filled with a sample profile, before the documents step. **Delete all my data** at the foot of the goals list starts again from an empty account. The worker needs `TASKS_AUTH=off` in `worker/.env` locally, or it exits at start.

### End-to-end run on the emulators

```bash
pnpm --filter worker e2e:emulator
```

Seeds the rules, a profile and a priced draft house goal into the Firestore emulator, uploads the four synthetic September 2026 statements from `fixtures/statements/` to the Storage emulator, then runs the worker's `POST /runs` in-process against the real Gemini model and prints every stage update a listener sees, the snapshot, the metrics, the actions and the headline. Needs `GEMINI_API_KEY` in `worker/.env` and Java (the Storage emulator is downloaded on first use with `pnpm exec firebase setup:emulators:storage`).
