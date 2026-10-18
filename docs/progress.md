# Progress

Update this file at the end of every coding session. Newest entries at the top of each section.

## Decisions still open

- Unreadable file after Submit: stop and send the user back, or continue and flag it on the result page.
- Values marked `[__]` in the rules and assumptions (need BI / OJK / bank sources).

## Decisions taken

- 2026-10-18: Backend language is TypeScript. One pnpm workspace; `shared/` (`@adidi/shared`) is imported by `web`, `api` and `worker`. Services use Hono on Node 26. Web is a Next.js static export served by Firebase Hosting; it calls the api by URL (`NEXT_PUBLIC_API_URL`) with CORS, no Hosting rewrite.
- 2026-10-18: Images are built by Cloud Build (`<svc>/cloudbuild.yaml`, repo-root context) so no local Docker is needed. Region default `asia-southeast1`.

## Done

- 2026-10-18: `specs/00-foundation.md` tasks 1–5 implemented locally (five commits on `main`): workspace layout, Biome, root README, `shared/` with Vitest and the rupiah formatting helpers (31 tests), `web/` placeholder page calling `GET /health`, `api/` and `worker/` with `/health`, Dockerfiles, Cloud Build configs, deploy scripts, `firebase.json`. Verified locally: lint, typecheck, build, tests, secrets check, and the page showing the live health JSON plus its error state.

## In progress

- `specs/00-foundation.md` deploy acceptance criteria (Hosting URL and both Cloud Run URLs) are pending the manual GCP setup: install `gcloud` and `firebase`, create the project, enable APIs, create the Artifact Registry repo, fill in `scripts/env.sh` and `.firebaserc`, then run the three deploy scripts in README order.

## Next

- `specs/01-contracts.md`
