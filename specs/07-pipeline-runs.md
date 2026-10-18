# 07 · Pipeline runs

## Goal

Run the analysis in the background after Submit, report progress live to the UI, and handle the four kinds of run: first goal, monthly check-in, second goal reusing a month, and recalculation after an Assumptions change.

## Depends on

01-contracts, 02 to 06. Background: `docs/analysis.md` ("Triggers"), `docs/product.md` ("Data ownership", "Monthly cycle").

## Behavior

`POST /runs` creates a `RunStatus` (stage `reading`, percent 0), sets the goals to `analysing`, enqueues one Cloud Task to `worker/`, and returns the `runId`.

The worker runs stages by kind and updates the run document as it goes:

| kind | stages | stage → percent |
|---|---|---|
| `first` | extraction → normalization → snapshot → simulate → agent | reading 18, cleaning 42, checking 71, planning 92, done 100 |
| `monthly` | as `first` for the new month, then stage 7 (delta) for every active goal | same |
| `reuse` | snapshot exists → simulate → agent for the new goal | checking 71, planning 92, done 100 |
| `recalculate` | simulate → agent for every active goal, current month | checking, planning, done |

On success: each goal becomes `active` with `latestAnalysisMonth` set; run stage `done`. On failure: stage `failed` with a user-readable `error`; goals return to their previous status (draft stays draft).

**Reuse rule**: a new goal uses the latest submitted month if it is no older than 45 days; otherwise the UI sends the user to the normal documents step.

**Monthly delta (stage 7)**: compare the new snapshot with the previous one. For each active goal store: metrics that changed (with old and new values), committed actions kept or not (e.g. PayLater loan gone or installment lower → refinance kept), and the new months-to-ready. Gemini writes a two-sentence summary from those numbers.

**Banner rule** (read by the goals list): show "{Month} is over: add its statements" when today ≥ the 1st of month M+1 and `users/{uid}/months/{M}` does not exist.

**Idempotency**: Cloud Tasks may retry. Each stage checks whether its output already exists for this run before redoing work, so a retry never duplicates transactions.

## Acceptance criteria

- Submitting the House-A fixture files produces stage updates in order and ends `done` with an `Analysis` stored; the UI listener sees each stage.
- A forced failure in extraction ends with stage `failed`, an error message, and the goal back to `draft`.
- A retried task does not create duplicate transactions (test by running the same task twice).
- A `reuse` run never calls extraction.
- A `monthly` run updates every active goal and stores a delta for each.
- Banner rule unit-tested around month boundaries (31 Oct → no banner; 1 Nov without October → banner; 1 Nov with October → no banner).

## Tasks

1. `/runs` endpoint, Cloud Task, run document.
2. Worker skeleton with stage updates and failure handling.
3. Wire stages for `first` (M1).
4. `reuse` and `recalculate`.
5. `monthly` and the delta.
6. Banner rule helper.

## Out of scope

Email or push notifications, scheduled jobs.
