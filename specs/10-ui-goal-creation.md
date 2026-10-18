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
- **Documents step**: uploads go straight to Cloud Storage through signed URLs, with a per-file progress bar and remove. Nothing is read before Submit. Accepted types: PDF, PNG, JPG; max 10 MB per file. Submit is enabled when at least one bank or e-wallet file is added.
- **Step 2 routing**: if a recent month exists (spec 07 reuse rule), Continue goes to the reuse step instead.
- Submit calls `POST /runs` and navigates to the progress view with the `runId`.

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
