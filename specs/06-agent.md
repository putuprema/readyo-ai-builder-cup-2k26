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
