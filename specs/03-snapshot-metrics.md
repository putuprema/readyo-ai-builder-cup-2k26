# 03 · Snapshot and readiness metrics

## Goal

Turn a month of normalized transactions, loans and holdings into one `Snapshot`, and compute the seven readiness metrics shown in the "Readiness checks" table.

## Depends on

01-contracts, 02-simulate (rule values). Background: `docs/analysis.md` ("Readiness metrics").

## Inputs and outputs

```ts
buildSnapshot(input: {
  month: string;                 // "YYYY-MM"; records from other months are ignored
  transactions: Transaction[];   // normalized (stage 3)
  loans: Loan[];
  holdings: Holding[];
  profile: Profile;
  bankBalances?: number[];       // closing balances of the bank and e-wallet statements, when shown
  incomeHistory?: number[];      // computed net income of earlier months (freelancer variability)
  sources?: SourceKind[];        // source kinds read this month (carry-forward)
  carriedFrom?: { snapshot: Snapshot; sources: SourceKind[] };   // last month, for a check-in
}): Snapshot
computeMetrics(snapshot, profile, goal, rules, simulation: SimulationResult): Metric[]
```

Both pure functions in `shared/` (`shared/src/snapshot/`), taking one options object like `simulate()`.

## Behavior

**Snapshot**

- `netIncome`: sum of `income` transactions with direction `in`, excluding `own_transfer`. The profile's confirmed income (`profile.netMonthlyIncome`, when above 0) is used as `netIncome`; the computed figure is kept as `computedNetIncome` for display.
- `essentialSpending`, `discretionarySpending`: sums by class, debits minus credits (a refund reduces spending); `discretionaryByCategory` from `category` (`other` when missing). `debt_payment` rows are not summed (see `debtPayments`); `investment` rows are the user's own money moving, not spending.
- `cashWithdrawals`: ATM withdrawals (class `cash`), treated as one spending bucket.
- `debtPayments`: sum of installments of active loans (outstanding above 0), from the loan statements, not from transactions, to avoid double counting. `loans` holds the active loans.
- `liquidAssets`: holdings with `liquidityClass` cash or liquid and `volatile = false`, plus the bank balances if extracted (the balances are also stored as `bankBalances`). Locked, non-volatile holdings (time deposits) count toward neither figure.
- `volatileAssets`: holdings with `volatile = true`.
- `incomeVariability` (freelancers only): population standard deviation over the mean of `incomeHistory` plus this month's computed income, set only when two or more months are available.
- Missing source this month (monthly check-in): the caller passes the source kinds read this month (`sources`) and last month's snapshot with its kinds (`carriedFrom`). Every kind of last month missing this month is listed in `estimatedSources` (display order: bank, ewallet, paylater, pinjol, investment) and its values are copied from `carriedFrom.snapshot`. A stored snapshot holds aggregates, so sources are carried in buckets: a missing `bank` or `ewallet` carries the flows wholesale (computed income, spending by class and category, cash withdrawals, bank balances), since e-wallet spending cannot be separated from last month's totals; a missing `paylater` or `pinjol` carries last month's active loans of that type as they are (their `month` shows they are last month's records); a missing `investment` carries the volatile assets and the liquid holdings (last month's `liquidAssets` minus its `bankBalances`). A kind last month did not have is never estimated.

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
