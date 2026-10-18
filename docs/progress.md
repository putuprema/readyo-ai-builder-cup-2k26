# Progress

Update this file at the end of every coding session. Newest entries at the top of each section.

## Decisions still open

- Unreadable file after Submit: stop and send the user back, or continue and flag it on the result page.
- Values marked `[__]` in the rules and assumptions (need BI / OJK / bank sources).

## Decisions taken

- 2026-10-18: API error contract: 401 `unauthorized` without a Firebase ID token, 400 `invalid_request` with `issues[]` from zod, 501 `not_implemented` for stubs. Validation schemas live in `api/src/schemas.ts` and are checked against the shared types with `satisfies`.
- 2026-10-18: Firestore rules tests and the demo seed run on the Firebase emulators (`scripts/with-emulators.sh`, Java from the PATH or Homebrew OpenJDK, `firebase-tools` as a root dev dependency). They are part of `pnpm test`.
- 2026-10-18: Demo data is a pure module in `shared/src/demo/` with consistency tests; `api/scripts/seed-demo.ts` only writes it. The demo account is `demo@adidi.app` (uid `demo-user`), password from `DEMO_PASSWORD` (fixed test value on the emulators).
- 2026-10-18: Backend language is TypeScript. One pnpm workspace; `shared/` (`@adidi/shared`) is imported by `web`, `api` and `worker`. Services use Hono on Node 26. Web is a Next.js static export served by Firebase Hosting; it calls the api by URL (`NEXT_PUBLIC_API_URL`) with CORS, no Hosting rewrite.
- 2026-10-18: Images are built by Cloud Build (`<svc>/cloudbuild.yaml`, repo-root context) so no local Docker is needed. Region default `asia-southeast1`.

## Done

- 2026-10-18: `specs/01-contracts.md` tasks 1–4 (four commits on `main`): `shared/src/types.ts` with every contract plus the `simulate()` types, `firestorePaths`, type imports in web, api and worker; `firestore.rules` with 26 emulator tests; all ten api endpoints as stubs with Firebase ID token auth and zod validation (51 tests); the demo seed (`pnpm seed:demo`, `pnpm seed:demo:emulator`) verified on the emulators: Auth user created, 26 documents written, goal reads back `active`. Acceptance criteria hold locally. Not verified: the seed against the real project (no GCP project yet).
- 2026-10-18: `specs/00-foundation.md` tasks 1–5 implemented locally (five commits on `main`): workspace layout, Biome, root README, `shared/` with Vitest and the rupiah formatting helpers (31 tests), `web/` placeholder page calling `GET /health`, `api/` and `worker/` with `/health`, Dockerfiles, Cloud Build configs, deploy scripts, `firebase.json`. Verified locally: lint, typecheck, build, tests, secrets check, and the page showing the live health JSON plus its error state.

## In progress

- `specs/00-foundation.md` deploy acceptance criteria (Hosting URL and both Cloud Run URLs) are pending the manual GCP setup: install `gcloud` and `firebase`, create the project, enable APIs, create the Artifact Registry repo, fill in `scripts/env.sh` and `.firebaserc`, then run the three deploy scripts in README order.

## Next

- `specs/02-simulate.md` (engine track) and `specs/04-extraction.md` (AI track) can start in parallel against the contracts.
- When spec 02 lands, replace the hand-computed timelines in `shared/src/demo/timelines.ts` with real `simulate()` output, and seed `rules/` from `shared/rules/defaults.json`.
- Run `pnpm seed:demo` against the real project once it exists.
