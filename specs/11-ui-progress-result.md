# 11 · UI: progress view and readiness result

## Goal

The full-screen progress view after Submit and the readiness result page: path cards, readiness checks, the plan with action choices, and the rules panel.

## Depends on

01-contracts (seed analysis for mocks), design artboards 2b, 3, 3a. Behavior: `docs/screens.md` sections "2b", "3". Wiring: 06-agent (choices endpoint), 07-pipeline-runs (run status).

## Behavior

**Progress view**

- Listens to `users/{uid}/runs/{runId}`. Headline, sentence, percent ring, striped bar and the four stage chips follow `stage` and `percent`.
- **Go to my goals** always visible. **See your readiness** appears when `stage = done`.
- `failed`: show the error in plain language and a button back to the documents step.
- Animations stop under `prefers-reduced-motion`.

**Result page**

- Reads the goal and its latest `Analysis`.
- Headline sentence from `analysis.summary`; eyebrow with goal summary and target.
- Path cards from `withoutPlan` and the current plan result. Loan path leads when the pay preference is loan or none; wedding has one savings path.
- Readiness checks table from `analysis.metrics`.
- **Plan**: one card per action. Choices call `PATCH .../choices` optimistically and roll back on error.
  - undecided: I'll do this / Not for me.
  - committed: green 2 px outline, line about checking next month's statements, Undo. No badge.
  - dismissed: collapsed dashed card, "Skipped", what is lost, Undo. No alternatives.
  - The line under the plan title reads "With your choices: approval in N months (M with all three) · X in your plan, Y skipped." once any choice is made; N comes from the server, not computed in the browser.
- **Also considered** card: collapsed by default; See the rules used / Hide the rules toggles the table built from `rulesChecked` and `rejectedOptions`. Blocking rows in red.
- Bottom cards: key assumptions (link to Assumptions) and next check-in text ("any time from 1 {next month}"). No reminder.
- Export PDF: browser print stylesheet is enough for the hackathon.

## Decisions taken while building (2026-10-18)

- **Routes under the static export**: `next.config.ts` switches `output: "export"` on for `next build` only; in `next dev` the dynamic routes render any goal id. Each page exports `generateStaticParams()` returning the placeholder id `_`, `firebase.json` rewrites `/goals/*/progress` and `/goals/*/result` to the exported placeholder pages, and the client reads the real goal id from `window.location` (`web/components/result/goal-id.ts`). Later routes under `/goals/[id]/` should follow the same pattern.
- **Data sources**: with `NEXT_PUBLIC_FIREBASE_PROJECT_ID` (or `NEXT_PUBLIC_FIREBASE_EMULATORS=1`) the pages listen to Firestore and call the api; without either they show the shared demo analysis with a mock choices api that runs the shared `planWithChoices()`, so the design can be reviewed from a plain `pnpm dev`. The Firebase init, the user hook and the emulator demo sign-in live inside `web/components/result/` until spec 10's shell sign-in lands; against the emulators a signed-out visitor is signed in as the seeded demo account.
- **Run to follow**: `?run=<id>` (what Submit passes), else the latest run whose `goalIds` holds the goal (picked client-side from an `array-contains` query, so no composite index is needed).
- **Plan line**: "X in your plan" counts committed actions (as the design's script does); "Y skipped" counts dismissed ones; N is `withChoices` on the analysis document or the PATCH response's `plan.monthsToReady`, never computed in the browser. Before any choice the line reads "Together they move KPR approval from 24 months to this month. Order matters." A month-0 plan shows "Now · approvable this month" on the path card and "this month" in sentences; a null baseline reads "not within 30 years" (`DEFAULT_MAX_MONTHS / 12`).
- **Numbers on the page**: everything is selected and formatted from the analysis document (`web/components/result/model.ts`, `rules-table.ts`, tested against the shared demo). The only conversions are display ones: months to years on the cash card, ratios to percent, rupiah formatting. The subline under the headline says whether anything blocks without counting.
- **Stage chips** carry fixed notes without numbers; the run document has no counts. The footer copy says "Usually a few minutes" (the e2e run took three).
- **Documents step link**: the failed state and the result's Upload button link to `/goals/{id}/documents/` and `/documents/`; spec 10 and spec 13 own those routes and may change them.
- **Assumptions**: the bottom card lists the values from `rulesChecked` (growth, emergency fund, DTI cap, DP, rate) rather than the design's fixed five; the money-market return is not in `rulesChecked`.

## Acceptance criteria

- With the seeded analysis, the page matches artboard 3 in layout and copy structure at 1280 px and stays usable at 390 px.
- Clicking I'll do this, Not for me and Undo changes the card state and the plan line, and survives a reload.
- The rules panel opens and closes and is collapsed on first load.
- The progress view moves through all four stages with a fake run document updated by a test script, and shows the failure state when `stage = failed`.
- Every number on the page comes from the analysis document (no arithmetic in the browser beyond formatting).

## Tasks

1. Progress view with a fake run document.
2. Result page layout with the seeded analysis.
3. Action cards and choices.
4. Rules panel.
5. Wire to real runs and analyses.

## Out of scope

Charts of the timeline (could be added in M3 if time allows).
