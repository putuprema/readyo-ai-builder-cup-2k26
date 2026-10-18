# 06 · Recommendation agent (stage 6)

## Goal

Find up to three actions that make the goal ready sooner, prove each one with `simulate()`, and explain them in plain language. This is the propose → verify → explain loop judges should see.

## Depends on

02-simulate, 03-snapshot-metrics. Background: `docs/analysis.md` ("Recommendation agent", "Action choices").

## Behavior

**Inputs to the agent**: snapshot, metrics, goal, rules, the `withoutPlan` simulation, and the user's dismissed actions from earlier months (never propose those again).

**Tools** (function calling):

- `simulate(changes: Change[])` → returns `monthsToReady` for both paths, `approvableToday`, and month-0 `failing`. Wraps the real `simulate()` with the fixed inputs.
- `list_loans()`, `list_spending_categories()`: read-only views of the snapshot so the model uses real ids and amounts.

**Loop** (Gemini Pro tier):

1. The model proposes one candidate change at a time, using the change types in spec 02 (refinance or pay off a loan, cap a spending category, move volatile assets to liquid).
2. It calls `simulate` with the candidate added to the changes kept so far.
3. Code keeps the candidate only if it reduces `monthsToReady` on the leading path or removes a rule from month-0 `failing`. Otherwise it is dropped.
4. Stop after three kept actions, or after 8 tool calls.
5. Order kept actions by `fromMonth`, then by months saved.

**Cards**: for each kept action, code builds `chips` and `monthsSaved` from the simulation results (e.g. "DTI 42% → 35%"), and Gemini writes `title`, `impactLine` and `description` given those numbers. The model never states a number that is not in the data passed to it; a check rejects any card whose text contains a number not present in its inputs.

**Plan results**: `withPlan` = `simulate()` with all kept actions. Stored in the `Analysis` with `choices` all `undecided`.

**Choices** (`PATCH .../choices`): no model call. The plan line is recomputed from `simulate()` with all non-dismissed actions. Dismissed actions are saved to `users/{uid}` preferences so later runs skip them. No alternatives are generated after a dismissal.

**Summary**: one headline sentence for the result page (e.g. "You're 14 months from a KPR, if you clear the PayLater first"), written by Gemini from the numbers.

### Decisions taken while building (2026-10-18)

- **Leading path**: cash for a wedding goal and for `payPreference: "cash"`, the loan path otherwise (the rule spec 11 uses for the path cards). The keep rule, `monthsSaved` and the summary all read it.
- **Keep rule**: a candidate is kept only if it improves both against the changes kept so far and alone against doing nothing. "Improves" means fewer months to ready on the leading path (`null` compares as later than any month) or at least one rule removed from month-0 `failing`, with no rule added. The same candidate twice is kept once; a redundant action never enters the plan; the acceptance re-verification holds by construction (`worker/src/agent/verify.ts`).
- **Null baseline**: `monthsSaved` is the action alone against doing nothing; when the baseline is `null`, never counts as the month after the horizon (`maxMonths + 1`, 361), so an action that turns never into month 17 outranks one that turns 20 into 15. The impact fact never shows that figure: it reads "Approval 8 months sooner" when both are finite, "Approval in 17 months; not within 30 years without it" for a null baseline, and "Clears the debt-to-income cap this month" when the action was kept for clearing a rule only (`monthsSaved` 0). House-A (null baseline) is the fixture for the first two cases.
- **Plan diversity**: a plan holds at most one `cap_spending`, one `move_assets` and one action per loan; the `simulate` tool refuses a candidate that would break this with a message naming what to test instead. Without it the first live run produced three spending caps and never touched the PayLater. The prompt gives the order to test: expensive debt first (when the goal has a loan path), then the volatile assets when the goal is under 36 months away, then one cap.
- **Thinking**: the agent's turns and the writer call run with `thinkingLevel` LOW (`thinking: "low"` on the client requests); with the model's default a single turn took up to 103 s on `gemini-3.1-pro-preview`, which `gemini-pro-latest` resolves to today.
- **Budget**: every tool call counts toward the 8, the two list tools included; the prompt already carries the loans and the categories, so a run rarely needs them. The loop also stops when the model answers in words.
- **Wedding**: the `simulate` tool refuses `refinance_loan` and `pay_off_loan` with a message to the model; the model is told to propose savings actions only.
- **Dismissed actions** are `DismissedAction { type, loanId?, category? }` (shared types), matched by type plus the loan or category (`move_assets` by type alone). The tool refuses them before simulating; the prompt lists them. The choices endpoint stores them at `users/{uid}` under `preferences.dismissedActions` with `dismissedActionsFrom()` and `mergeDismissedActions()` from `shared/src/plan/choices.ts`.
- **Text**: one structured-output call (Pro tier) writes `title`, `impactLine` and `description` for every card and the summary sentence. The number check parses every digit run in the text and the facts to a value ("12.4", "1350000"); a converted or rounded number is rejected. A rejected card or summary gets one retry naming the offending numbers, then a template made of the facts, so a run never fails for prose. Chips are always code-built.
- **Task 4 split**: the pure part (plan line recomputed with `planWithChoices()`, dismissed actions as preferences) lives in `shared/`; the `PATCH .../choices` route itself belongs to the api track (spec 05 ran in `api/` in parallel).
- **Entry point**: `runAgent(input, model)` in `worker/src/agent/index.ts` returns the `Analysis` pieces (`withoutPlan`, `withPlan`, `actions`, `choices` all `undecided`, `rejectedOptions`, `summary`) plus the tool-call trace; spec 07 adds the metrics and stores the document (dropping `undefined` values first).

## Acceptance criteria

- House-A fixture → at least one kept action, and the PayLater refinance or pay-off is among them; `withPlan.loan.monthsToReady` < `withoutPlan.loan.monthsToReady`.
- Every kept action, applied alone, strictly improves months or removes a failing rule (re-verified in the test without the model).
- A previously dismissed action type for the same loan or category is never proposed again.
- No card text contains a number missing from its inputs (automated check).
- At most 8 tool calls per run (logged).
- Wedding goal → no refinance suggested for a loan path that doesn't exist; actions target savings only.

## Tasks

1. Tool wrappers around `simulate()` and snapshot views.
2. The loop with keep/drop logic in code.
3. Card text generation with the number check.
4. Choices endpoint and plan line recomputation.
5. Summary sentence.

## Out of scope

Alternatives after a skip, cross-goal budget allocation, more than three actions.
