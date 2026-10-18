# Progress

Update this file at the end of every coding session. Newest entries at the top of each section.

## Decisions still open

- House-A (the spec 02 reference profile) never reaches KPR approval under the default rules: the DP is covered around month 50 but the tenor shrinks every year (loan must end by 55), so DTI is back above the cap from month 40. Either the fixture, the demo story or the rules need a decision (e.g. a lower target, a higher income, or income growth in the simulation).
- The option rejections without a numeric rule (`marital_status`, `flpp_first_home_only`) are string ids, not rules in the table. Fine for the panel; decide whether they need `rules/` records with sources.
- Unreadable file after Submit: stop and send the user back, or continue and flag it on the result page.
- Values marked `[__]` in the rules and assumptions (need BI / OJK / bank sources).

## Decisions taken

- 2026-10-18: `simulate()` semantics (specs/02-simulate.md): month 0 is the snapshot as given; changes with `fromMonth = m` apply before month m is evaluated; cash flow, savings growth and loan amortisation happen when advancing to m + 1. Loans amortise (interest accrues, installment paid) and drop out of `debtPayments` when the tenor ends. Target growth uses the rules table, not the estimate's own rate. Goal date for the 36-month volatile rule is December of `targetYear` (wedding: `targetMonth`). The loan path is computed for every house and car goal regardless of `payPreference`. `pay_off_loan` executes in the first month liquid covers the balance.
- 2026-10-18: Rules are data: `shared/rules/defaults.json` (exported as `@adidi/shared/rules/defaults.json`) leaves the `[__]` values out and `requireRule()` throws when one is missing. Tests use `fixtures/profiles/rules-test.json` with clearly marked test-only placeholders. The freelance emergency rule is its own record, `emergency_months_required_freelance`.
- 2026-10-18: `preferredTenorYears?` added to `HouseInputs` and `CarInputs` (default 20 years / `kkb_max_tenor_years`).
- 2026-10-18: API error contract: 401 `unauthorized` without a Firebase ID token, 400 `invalid_request` with `issues[]` from zod, 501 `not_implemented` for stubs. Validation schemas live in `api/src/schemas.ts` and are checked against the shared types with `satisfies`.
- 2026-10-18: Firestore rules tests and the demo seed run on the Firebase emulators (`scripts/with-emulators.sh`, Java from the PATH or Homebrew OpenJDK, `firebase-tools` as a root dev dependency). They are part of `pnpm test`.
- 2026-10-18: Demo data is a pure module in `shared/src/demo/` with consistency tests; `api/scripts/seed-demo.ts` only writes it. The demo account is `demo@adidi.app` (uid `demo-user`), password from `DEMO_PASSWORD` (fixed test value on the emulators).
- 2026-10-18: Backend language is TypeScript. One pnpm workspace; `shared/` (`@adidi/shared`) is imported by `web`, `api` and `worker`. Services use Hono on Node 26. Web is a Next.js static export served by Firebase Hosting; it calls the api by URL (`NEXT_PUBLIC_API_URL`) with CORS, no Hosting rewrite.
- 2026-10-18: Images are built by Cloud Build (`<svc>/cloudbuild.yaml`, repo-root context) so no local Docker is needed. Region default `asia-southeast1`.

## Done

- 2026-10-18: `specs/02-simulate.md` tasks 1–7 (seven commits on `spec-02-simulate`, not merged): `shared/rules/defaults.json`, `mergeRules`/`requireRule`, four profile fixtures plus `rules-test.json`; `annuity`/`grow`/`amortizeOneMonth`/`monthsBetween`; `simulate()` with the cash path, the loan path (`planLoan`, `checkLoanMonth`), `blockedBy`, `rulesChecked`, the four change types, `rejectedOptions`; monotonicity and determinism property tests. 142 tests in `shared/`; every acceptance criterion in the spec has a test (`annuity` = 4,771,668; House-A blocked by `dti_cap` 0.382, `emergency_months_required` 0.5, `min_dp_first_home_new` Rp 160 m; refinance to Rp 1.1 m clears `dti_cap` with DTI 0.3266; wedding has no `loan`; `joint_application` and `tenor_25y` rejections; PayLater drops out at month 8; `null` when never ready; deep equality on repeat).
- 2026-10-18: `specs/01-contracts.md` tasks 1–4 (four commits on `main`): `shared/src/types.ts` with every contract plus the `simulate()` types, `firestorePaths`, type imports in web, api and worker; `firestore.rules` with 26 emulator tests; all ten api endpoints as stubs with Firebase ID token auth and zod validation (51 tests); the demo seed (`pnpm seed:demo`, `pnpm seed:demo:emulator`) verified on the emulators: Auth user created, 26 documents written, goal reads back `active`. Acceptance criteria hold locally. The seed also ran against the real project after Firebase Authentication (Email/Password) was enabled in the console.
- 2026-10-18: `specs/00-foundation.md` tasks 1–5 implemented locally (five commits on `main`): workspace layout, Biome, root README, `shared/` with Vitest and the rupiah formatting helpers (31 tests), `web/` placeholder page calling `GET /health`, `api/` and `worker/` with `/health`, Dockerfiles, Cloud Build configs, deploy scripts, `firebase.json`. Verified locally: lint, typecheck, build, tests, secrets check, and the page showing the live health JSON plus its error state.

## In progress

- `specs/00-foundation.md` deploy acceptance criteria (Hosting URL and both Cloud Run URLs) are pending the manual GCP setup: install `gcloud` and `firebase`, create the project, enable APIs, create the Artifact Registry repo, fill in `scripts/env.sh` and `.firebaserc`, then run the three deploy scripts in README order.

## Next

- `specs/02-simulate.md` (engine track) and `specs/04-extraction.md` (AI track) can start in parallel against the contracts.
- Merge the spec 02 branch, then replace the hand-computed timelines in `shared/src/demo/timelines.ts` with real `simulate()` output (the demo profile may need the same reachability check as House-A), and seed `rules/` from `shared/rules/defaults.json` (never from `rules-test.json`).
- Decide the House-A reachability question above before building the agent (spec 06), whose "approval N months sooner" line needs a finite month.
