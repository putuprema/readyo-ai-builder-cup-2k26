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
