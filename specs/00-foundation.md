# 00 · Foundation

## Goal

A repo where every part has a home, and a "hello world" deployed to Firebase Hosting and Cloud Run on day one, so deployment problems appear early.

## Depends on

Nothing. Done by hand before this session (the coding agent cannot do these): GCP project with billing, Firebase project linked to it, APIs enabled (Cloud Run, Cloud Tasks, Firestore, Cloud Storage, Secret Manager, Vertex AI or Gemini API), a service account for the services, `gcloud` and `firebase` CLIs logged in on your machine.

## Layout

```
/
├─ AGENTS.md
├─ docs/          product, analysis, screens, progress
├─ specs/
├─ design/        design handoff
├─ fixtures/      anonymised statements, expected JSON, test profiles
├─ shared/        types and pure logic used by web, api and worker (simulate, metrics, rules)
├─ web/           Next.js app (Firebase Hosting)
├─ api/           Cloud Run service: uploads, goals, short requests
└─ worker/        Cloud Run service: analysis pipeline, triggered by Cloud Tasks
```

If the backend language is Python, `shared/` logic that the frontend also needs (types, display formatting) is duplicated as TypeScript types; `simulate()` and metrics live in the backend only. If TypeScript, everything in `shared/` is one package used by all three.

## Behavior

- `web/` renders a placeholder page and calls `GET /health` on `api/`.
- `api/` and `worker/` each expose `GET /health` returning `{ "ok": true, "service": "<name>", "version": "<git sha>" }`.
- Secrets (Gemini key if used) come from Secret Manager or environment variables, never from the repo.
- One command per part to run locally, one to deploy, documented in a root `README.md`.
- Lint and formatting set up once; a test runner configured in `shared/`.

## Acceptance criteria

- The Firebase Hosting URL shows the placeholder page and the `api` health response.
- Both Cloud Run URLs return their health JSON.
- `git grep` finds no API keys or service account JSON in the repo.
- A new team member can run everything locally by following `README.md`.

## Tasks

1. Create the folder layout, root `README.md`, `.gitignore`, lint and format config.
2. Scaffold `web/` (Next.js + TypeScript) with the placeholder page.
3. Scaffold `api/` and `worker/` with `/health`, Dockerfiles, and deploy scripts for Cloud Run.
4. Configure Firebase Hosting for `web/` and deploy.
5. Set up the test runner in `shared/` with one passing example test.

## Out of scope

Auth, Firestore, any feature logic.
