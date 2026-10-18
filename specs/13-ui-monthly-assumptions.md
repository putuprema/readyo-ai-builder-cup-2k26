# 13 · UI: monthly check-in and Assumptions

## Goal

The monthly upload that refreshes every active goal, and the Assumptions page where the user sees and overrides every rule and assumption.

## Depends on

01-contracts, 02-simulate (rule ids), 07-pipeline-runs (`monthly` and `recalculate` runs). Design artboards 5 and 7. Behavior: `docs/screens.md` sections "5", "7".

## Behavior

**Monthly check-in**

- Shows the month being added (the latest finished month without a submission) and chips for each active goal with its current headline.
- "Same sources as last month": one row per source submitted last month, with what it contained and a slot for this month's file. Missing sources show the amber "Missing" drop zone.
- "Add a new source" for anything new.
- Submit is allowed with sources missing; the run carries them forward and the result marks them as estimates.
- Submit calls `POST /runs` with `kind: "monthly"` and opens the progress view.
- After the run, each result page shows what moved since last month (from the stored delta) above the plan.

**Assumptions**

- Lists every rule and assumption from spec 02, grouped: Lending rules (table with editable values), Prices and rates, Savings returns. Each shows source and checked date.
- Editing a value stores it locally as pending; the amber banner shows the number of pending changes with Discard and Recalculate {k} active goals.
- Recalculate saves overrides (`PUT /overrides/:ruleId`) and calls `POST /recalculate`, then shows progress.
- An overridden row shows "Edited · default X · Reset". Reset all to defaults clears every override (with confirmation).
- Validation: ratios between 0 and 1 (entered as percent), ages 40–75, years 1–30.

## Acceptance criteria

- With last month's sources seeded, the check-in lists them and shows Missing for those not yet added.
- Submitting with a missing source completes and the snapshot lists it in `estimatedSources`.
- Changing the DTI cap from 35% to 40% and recalculating changes the House-A goal's months-to-approval to a number no larger than before.
- Reset restores the default and removes the override document.
- Invalid values cannot be saved and show an inline message.

## Tasks

1. Check-in layout with seeded sources.
2. Upload slots and Submit.
3. Delta display on the result page.
4. Assumptions list and pending edits.
5. Recalculate and reset.

## Out of scope

Per-goal assumptions (overrides apply to all of the user's goals).
