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

2026-10-18: the Assumptions page is read-only in this milestone (decided by the team to save time). Out: editing values, pending edits and the amber banner, Recalculate, Reset and Reset all (the edit half of task 4 and all of task 5), and with them the acceptance criteria on the DTI change, Reset and validation. The page lists every rule from the `rules` collection with its value, unit, use, source and checked date, and shows a stored override next to the default.

## Decisions taken while building

- Routes: the check-in is `/documents/` and Assumptions is `/assumptions/`, the paths the header tabs link to. Components in `web/components/checkin/`, `web/components/assumptions/`, the delta card in `web/components/result/`.
- Check-in month: `monthlyBannerFor` (the latest finished month without a submission). When it is already in, the page says so and when the next one opens. In `next dev` only, `?month=YYYY-MM` picks a month not yet submitted, so the flow can be tried before the month is over.
- Source rows: one per entry of the previous month's `MonthRecord.sources`. The title is the lender (PayLater, pinjol), the provider (investments) or the institution of the masked account (bank, e-wallet) read from that file's records, else the file name; "what it contained" counts the month's transactions, loans and holdings by `sourceFileId`.
- Uploads: the documents step's upload state moved into `web/components/documents/useUploads.ts` and its file row into `FileRow`; both pages use them. A file dropped on a row takes that row's kind; a new source takes any kind. Submit needs one uploaded file and nothing in flight, posts `kind: "monthly"` with every active goal, and opens the first goal's progress view.
- Delta: a card between the readiness table and the plan, only when `analysis.delta` exists: the stored summary, months to ready old to new on the leading path, the checks that moved (formatted like the readiness table) and each committed action kept or not with its evidence.
- Assumptions groups: Lending rules (table), Prices and rates, Savings returns, plus Readiness checks for our own thresholds (`expensive_debt_rate`, `savings_rate_*`) and any rule not mapped to a group.
- Known gap: the worker carries sources forward by kind, not by file. With two files of one kind last month (Bibit and Indodax) and only one this month, the page shows the other as Missing but the snapshot neither carries it nor lists it in `estimatedSources`.
