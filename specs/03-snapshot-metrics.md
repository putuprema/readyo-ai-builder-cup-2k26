# 03 · Snapshot and readiness metrics

## Goal

Turn a month of normalized transactions, loans and holdings into one `Snapshot`, and compute the seven readiness metrics shown in the "Readiness checks" table.

## Depends on

01-contracts, 02-simulate (rule values). Background: `docs/analysis.md` ("Readiness metrics").

## Inputs and outputs

```ts
buildSnapshot(month, transactions, loans, holdings, profile, carriedFrom?: Snapshot): Snapshot
computeMetrics(snapshot, profile, goal, rules, simulation: SimulationResult): Metric[]
```

Both pure functions in `shared/`.

## Behavior

**Snapshot**

- `netIncome`: sum of `income` transactions, excluding `own_transfer`. If the user confirmed a different income in their profile, use the profile value and keep the computed one for display.
- `essentialSpending`, `discretionarySpending`: sums by class; `discretionaryByCategory` from `category`.
- `cashWithdrawals`: ATM withdrawals (class `cash`), treated as one spending bucket.
- `debtPayments`: sum of installments of active loans (from the loan statements, not from transactions, to avoid double counting).
- `liquidAssets`: holdings with `liquidityClass` cash or liquid and `volatile = false`, plus bank balances if extracted.
- `volatileAssets`: holdings with `volatile = true`.
- Missing source this month (monthly check-in): copy that source's values from `carriedFrom` and list it in `estimatedSources`.

**Metrics** (ids, in display order)

| id | you | rule | status |
|---|---|---|---|
| `net_income` | `netIncome` | — | passes |
| `dti` | (debt payments + installment at month 0) / income | `dti_cap` | blocks if above |
| `emergency_fund` | liquid / essential, months | `emergency_months_required` | blocks if below |
| `expensive_debt` | outstanding on loans with rate > 24%/yr | 0 | needs work if > 0 |
| `savings_rate` | surplus / income | 0.20 | needs work 0.10–0.20, blocks below 0.10 |
| `goal_progress` | (liquid − emergency requirement) / DP needed (or cash target for wedding / cash preference) | 1.0 | needs work if below |
| `horizon_risk` | volatile share of goal savings, only if goal < 36 months away | 0.20 | needs work if above |

Wedding: `dti` and `expensive_debt` still shown (debt still slows saving) but `dti` never "blocks" since there is no loan.

`meaning` is a short plain-language sentence produced by a template with the numbers filled in by code (e.g. "PayLater Rp 2.1 m/mo plus the KPR installment pushes you over the cap banks use"). Gemini may rephrase it later in the summary, but the numbers come from code.

## Acceptance criteria

- House-A fixture (spec 02) → `dti` ≈ 0.38 blocks, `emergency_fund` 0.5 blocks, `expensive_debt` Rp 12.4 m needs work, `savings_rate` ≈ 0.13 needs work.
- Own-account transfers in the fixture transactions do not change `netIncome` or spending.
- A month with the PayLater source missing reuses last month's loan and lists it in `estimatedSources`.
- Metrics are returned in the display order above.

## Tasks

1. `buildSnapshot` with tests on a small hand-written transaction list.
2. Carry-forward for missing sources.
3. `computeMetrics` and the meaning templates.

## Out of scope

Freelancer income variability beyond computing the number (no special UI yet).
