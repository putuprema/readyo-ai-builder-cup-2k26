# 10 · UI: shell and goal creation

## Goal

The app shell and the flow from first visit to Submit: welcome, goal forms (house, car, wedding), the documents step, and the second-goal reuse step.

## Depends on

01-contracts (seed data for mocks), the design in `design/` (artboards 0, 1, 1b, 1c, 2, 6). Behavior: `docs/screens.md` sections "Global", "0", "1", "2", "6". Wiring later: 05-pricing, 07-pipeline-runs.

## Behavior

Follow `docs/screens.md` for layout and states. Points the mockups do not show:

- **Shell**: header with Goals · Documents · Assumptions. A tab looks selected only on its own list page; never during goal creation or on the result page.
- **Auth**: Firebase Auth (Google sign-in is enough). First visit with no goals → Welcome; returning user → Goals list.
- **Goal picker** switches the form below; the URL reflects the type (e.g. `/goals/new?type=car`).
- **Chips** (radio options) show the selected style on the option actually chosen.
- **Draft saving**: the draft is saved on Save draft and on Continue. Leaving the page with unsaved changes asks for confirmation.
- **Estimate card**: empty / fresh / stale states as in the spec. Stale when current inputs differ from `estimate.inputsUsed`. Continue is disabled until an estimate exists or the user typed a price.
- **Documents step**: uploads go straight to Cloud Storage through signed URLs, with a per-file progress bar and remove. Nothing is read before Submit. Accepted types: PDF, PNG, JPG; max 10 MB per file. Submit is enabled when at least one bank or e-wallet file is added. A new file starts with its card's first kind unless the file name names another (an e-wallet such as GoPay, OVO, DANA or ShopeePay in the bank card starts as E-wallet; a known pinjol in the loans card starts as Pinjol); the per-file dropdown still changes it.
- **Step 2 routing**: if a recent month exists (spec 07 reuse rule), Continue goes to the reuse step instead.
- Submit calls `POST /runs` and navigates to the progress view with the `runId`.

## Decisions taken while building

- **Auth** is email and password (Firebase Auth), not Google sign-in: the demo account `demo@example.com` from the seed is what judges and the demo video use. The sign-in card is prefilled with that email and, when the build has `NEXT_PUBLIC_DEMO_PASSWORD` (git-ignored env file), its password, so judges only press Sign in. The sign-in card replaces the greeting and the sample card on Welcome when signed out; pages that need a user show it in place of their content.
- **Goal endpoints**: `POST /goals`, `PATCH /goals/:id` and `DELETE /goals/:id` were 501 stubs until this spec; they are implemented here behind a `GoalWriteStore` port (`api/src/goals/`). `PATCH` accepts `draftStep` so Continue can move a draft to the documents step (spec 01 updated). Partial `inputs` are merged into the stored ones (`null` removes an optional field, e.g. the sizes when the person switches to a budget range) and the result is validated against the goal's own type (400 otherwise). Both refuse an `analysing` goal with 409 `goal_analysing`.
- **A typed price without an AI estimate** (the search failed, or the person skipped it) is stored by `PATCH { userOverride }` as an estimate with no sources: `targetToday`, `rangeLow` and `rangeHigh` equal to the typed price, `inputsUsed` the draft's inputs, the growth rule applied for `targetAtGoalDate`, and `userOverride` set. `POST /runs` and `simulate()` then work unchanged. A later Calculate Estimate replaces it (spec 05).
- **Profile**: the worker refuses a run without a profile at `users/{uid}` ("Complete your profile"), so Continue on the goal form opens a small modal for it when it is missing (age, employment, net monthly income, marital status, dependents, spouse income, city). The web writes `users/{uid}` directly with the Firebase SDK (the rules allow owner writes and there is no server-side logic); no api endpoint was added.
- **Dynamic routes under the static export**: `app/goals/[id]/documents/page.tsx` is prerendered once with the placeholder id `_` (`generateStaticParams`), Firebase Hosting rewrites `/goals/**/documents/**` to it, and the page reads the real id from the URL (`web/lib/route-id.ts`). Spec 11 uses the same pattern for `/goals/[id]/progress` and `/goals/[id]/result`.
- **City or area is a dropdown, not free text** (2026-10-18): the judges are mostly not Indonesian, so the house form offers five sample Jabodetabek cities from `web/lib/cities.ts` (Jakarta Selatan, Tangerang Selatan (Serpong), Depok, Bekasi, Bogor) behind a "Choose a city" placeholder the user must change. The stored `HouseInputs.area` stays a string, so no contract, pricing or seed change: the Serpong option stores "Serpong, Tangerang Selatan", the area the pricing live test uses; the others store their label. `toHouseInputs` accepts only a listed value ("Choose a city."). A draft whose area was typed before this change resumes as its city through each option's aliases (the demo seed's "Tangerang Selatan" maps to the Serpong option) or with the placeholder when nothing matches; its estimate then reads stale if the stored string differs, which is correct. Add a city in that one module.
- **Copy**: the note under Calculate Estimate, the loading card and the form header all say "about 30 seconds" (measured 20 to 35 s, spec 05).

## Acceptance criteria

- With mock data, every artboard in scope renders at 1280 px and at 390 px wide without horizontal scrolling (except tables in their own scroll box).
- Selecting a different chip moves the selected style.
- Changing a form field after an estimate shows the stale banner; pressing Recalculate clears it.
- Continue is disabled in the empty estimate state.
- An upload can be removed before Submit; the file is deleted from Cloud Storage.
- A user with this month already submitted sees the reuse step, not the upload step.
- All controls are real buttons, links or labelled inputs and are reachable by keyboard.

## Tasks

1. Shell, auth, routing.
2. Welcome.
3. House form with mock estimate states.
4. Car and wedding forms.
5. Documents step with real uploads.
6. Reuse step.
7. Wire Calculate Estimate (spec 05) and Submit (spec 07).

## Out of scope

Profile editing screen (profile fields can be collected in a simple modal on first goal creation).
