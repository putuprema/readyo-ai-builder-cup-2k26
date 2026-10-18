# 07 · Pipeline runs

## Goal

Run the analysis in the background after Submit, report progress live to the UI, and handle the four kinds of run: first goal, monthly check-in, second goal reusing a month, and recalculation after an Assumptions change.

## Depends on

01-contracts, 02 to 06. Background: `docs/analysis.md` ("Triggers"), `docs/product.md` ("Data ownership", "Monthly cycle").

## Behavior

`POST /runs` creates a `RunStatus` (stage `reading`, percent 0), sets the goals to `analysing`, enqueues one Cloud Task to `worker/`, and returns `202 { runId }`. It refuses with 409 a goal that is already `analysing` (`goal_analysing`), a goal whose status does not fit the kind (`goal_status`: `first` and `reuse` need drafts, `monthly` and `recalculate` active goals), a goal without an estimate (`goal_not_priced`), and a `reuse` month that was never submitted (`month_missing`) or is older than 45 days (`month_too_old`); 404 for a missing goal or document; 503 `queue_unavailable` when the task could not be enqueued (the goals are restored, the run marked `failed`).

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

## Decisions taken while building

- **Run document fields**: the Cloud Task body is `{ uid, runId }` only; `documentIds`, `goalStatusBefore` (the goals' statuses before the run, restored on failure), `updatedAt`, `finishedAt`, `attempt` and per-goal agent notes (`goals`) live on the `RunStatus` document (spec 01 updated). The task name is the `runId`, so Cloud Tasks itself drops a duplicate enqueue.
- **Percent**: the worker writes `{ stage, percent }` when it *enters* a stage, so the ring moves on every stage change and the numbers in the table are what the user sees (`reading` 18 while reading, `done` 100 at the end). `POST /runs` writes `reading` 0 before the worker starts.
- **Failures**: a known pipeline error (unreadable files, goal without an estimate, no stored month to reuse) fails the run at once with its user-readable message and answers 200, so Cloud Tasks does not retry. An unexpected error answers 500 for a retry; on the third attempt (`X-CloudTasks-TaskRetryCount` ≥ 2) the run is marked `failed` with a generic message. A run already `done` or `failed` answers 200 at once.
- **Idempotency**: extraction reuses a document already marked `extracted` (spec 04); the month record and each analysis carry the `runId` that wrote them and are not recomputed by a retry of the same run. Normalized rows overwrite the stored transactions by id; removed duplicates are deleted. Bank and e-wallet closing balances are kept on the `DocumentRecord` (`closingBalance`) so a retry can rebuild `bankBalances`.
- **Carried loans** on a check-in are stored as last month left them, not aged (spec 03).
- **Delta** lives on the new month's `Analysis` document (`delta`), not in its own collection. Committed actions are checked by code: pay-off → no active loan from that lender; refinance → that lender's installment lower; cap → the category's spending at or under the cap; move → volatile assets down by at least the amount. The summary is a Flash-tier structured call checked with the agent's number check, with a template fallback.
- **Reuse rule helper** (`reusableMonth`) and **banner rule helper** (`monthlyBannerFor`) are in `shared/src/months.ts`, used by the UI and by the api's validation of `reuse` runs. Age for the reuse rule counts from the end of the month.
- **Recalculate** carries the user's choices over to the new actions whose change matches (type plus loan or category).

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
