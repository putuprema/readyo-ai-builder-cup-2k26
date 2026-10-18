# 05 · Goal pricing (stage 1)

## Goal

When the user presses **Calculate Estimate**, turn the goal form into a rupiah target with a range and dated sources, which the user can then edit.

## Depends on

01-contracts, 02-simulate (growth rules). Background: `docs/product.md` (goal inputs), `docs/screens.md` (estimate card states).

## Behavior

- Endpoint `POST /goals/:id/estimate` with body `{ type, inputs }`: the exact form values on screen, which may be newer than the saved draft (the goal must already exist; the draft itself is not updated). Never called automatically on input change. Answers 404 for a missing goal, 400 when `type` is not the goal's type, 409 while the goal is `analysing`, 501 for car and wedding until task 3.
- Gemini with Google Search grounding, Flash tier by default (`PRICING_MODEL_TIER=pro` to override): measured on the Serpong house, Flash answered in 23 s with page-level listing URLs and dates, Pro in 52 s citing homepages. The prompt asks for current prices matching the inputs (house: area, type, size, new/secondary; car: model or segment, new/used, on-the-road in the city; wedding: city, guests, scale), and returns structured output: `targetToday`, `rangeLow`, `rangeHigh`, and the sources it used (title, URL, date).
- Code, not the model, computes `targetAtGoalDate` from `targetToday` and the growth rule for the goal type, and for weddings the amount the user must save (cost − partner share − family contribution), stored as `estimate.savingsTarget`.
- Store `inputsUsed` (the exact form values sent) and `calculatedAt`. A fresh calculation replaces the whole estimate, including a `userOverride` typed for the previous inputs. Growth horizon: whole years from the calculation year to `targetYear` for house and car; exact months to `targetMonth` for a wedding. Growth comes from the `rules` collection merged with the user's overrides.
- Stale detection in the UI: compare current form values with `inputsUsed`; no model call.
- If grounding returns no usable sources (no source with an http(s) URL, or no price), or the model call fails, return HTTP 200 `{ targetToday: null, message }` and store nothing; the UI keeps the price field editable so the user can type a number and continue. A price outside its own range is treated as a failed call.
- `PATCH /goals/:id` with `userOverride` stores the user's own number; `simulate()` uses it instead of `targetToday`.

## Acceptance criteria

- House: "landed, 70/90 m², new, Serpong, 2028" returns a target within its own range, at least one source with a URL, and `targetAtGoalDate` = `targetToday × 1.06^years` (to the rupiah).
- Wedding: response includes cost and the computed savings target after contributions.
- Calling with identical inputs twice is allowed but the UI only calls on button press (UI test).
- No source → `targetToday: null`, HTTP 200, a user-facing message.
- Sources are stored with dates and shown on the estimate card.

## Tasks

1. House prompt + schema + endpoint.
2. Growth and wedding arithmetic in code with tests.
3. Car and wedding prompts (M2).
4. Failure path.

## Out of scope

Price history charts, comparing several listings in the UI.
