# Analysis

## Triggers

| User action | What runs |
|---|---|
| Presses **Calculate Estimate** on a goal form | Stage 1 (pricing) only. Never on every keystroke. |
| Presses **Submit** on the documents step (first goal or monthly check-in) | Stages 2–6, then stage 7 if a previous month exists |
| Submits a new goal that reuses the latest month | Stages 4–6 only (no extraction) |
| Changes a value on the Assumptions page and presses **Recalculate** | Stages 5–6 for every active goal |
| Marks an action "I'll do this" / "Not for me" / Undo | Recompute the plan line from stored simulation results (no model call) |

Nothing reads documents before Submit. The upload step only stores files.

## Pipeline

| # | Stage | Done by | Output |
|---|---|---|---|
| 1 | Pricing | Gemini + Google Search grounding | Target in rupiah, price range seen, sources with dates |
| 2 | Extraction | Gemini (multimodal, response schema) | Transactions, loans, holdings per file |
| 3 | Normalization | Code + a Flash-tier Gemini pass for classification | Clean, deduplicated, classified transactions |
| 4 | Financial profile | Code | Seven metrics; stored as a monthly snapshot |
| 5 | Scenario engine | Code: `simulate()` | Month-by-month timeline for cash and loan paths |
| 6 | Recommendation agent | Gemini with function calling on `simulate()` | Verified actions with quantified effects |
| 7 | Monthly delta | Code + Gemini for the wording | What moved, which committed actions were kept |

Use a Pro-tier Gemini model for extraction and the agent, a Flash-tier model for per-transaction classification. Pick current model versions at build time.

The UI shows four stages while running: Reading (2), Cleaning up (3), Checking the rules (4–5), Building your plan (6).

### Stage 1: pricing

Input: goal type and form fields. Output:

```json
{
  "targetToday": 1350000000,
  "rangeLow": 1100000000,
  "rangeHigh": 1600000000,
  "growthRatePerYear": 0.06,
  "targetAtGoalDate": 1520000000,
  "sources": [{ "title": "…", "url": "…", "date": "2026-10" }],
  "inputsUsed": { "…": "…" }
}
```

Store `inputsUsed`. The form compares current inputs to it to show the "You changed the details" stale state without another model call. If search fails, the user types the price; the editable field always works.

### Stage 2: extraction schemas

- Transaction: `date, amount, direction (in|out), counterparty, rawDescription, sourceAccount (masked), sourceFileId`
- Loan: `lender, type (paylater|pinjol|kta|other), outstandingPrincipal, monthlyInstallment, feeOrRate, effectiveAnnualRate (computed), dueDate, remainingTenorMonths`
- Holding: `instrument, provider, currentValue, liquidityClass (cash|liquid|locked), volatile (bool)`

Delete the raw file from Cloud Storage as soon as its extraction succeeds.

### Stage 3: normalization

- **Transfers between the user's own accounts** are not spending or income (BCA → GoPay top-up, salary moved to Bibit). Match equal amounts across sources within a short date window.
- **Dedup** overlapping statements.
- **Classes**: income, essential expense, discretionary expense, debt payment, investment contribution.
- **Recurring detection**: subscriptions, installments, rent.
- **Cash**: there is no cash input. Treat ATM withdrawals as one "cash" bucket so cash spending is not silently missing.

## Readiness metrics

| Metric | Computation | Threshold |
|---|---|---|
| Verified net income | Recurring inflows, own-account transfers excluded | — |
| Savings rate | (income − spending − debt payments) / income | ≥ 20% good, < 10% blocks |
| Emergency fund | liquid assets / monthly essential spending, in months | 3 for employees, 6 for freelancers |
| Debt-to-income (DTI) | monthly debt payments / net income (pinjol and PayLater count in full) | ≤ the DTI cap rule |
| Expensive debt | outstanding debt with effective rate above ~24%/yr | 0 before applying for a loan |
| Goal funding progress | earmarked liquid assets / cash needed (DP, full price, or wedding savings target) | 100% = ready |
| Horizon vs risk | share of goal savings in volatile assets when the goal is under 3 years away | < 20% |

Freelancers also get income variability (std dev / mean over the months available); banks treat unstable income as lower.

Status per metric: passes / needs work / blocks approval. The result page leads with months-to-ready, then these as a table, never with a composite score.

## Rules and assumptions

Stored as data with defaults, a source and a "last checked" date. Users can override values for their own account (Assumptions page); overrides never change the defaults.

```json
{
  "id": "dti_cap",
  "label": "Debt-to-income cap",
  "value": 0.35,
  "unit": "ratio",
  "usedFor": ["kpr", "kkb"],
  "source": { "title": "[bank criteria]", "url": "…" },
  "checkedAt": "2026-10-01"
}
```

Rules: DTI cap, minimum DP first home new build, minimum DP secondary/second home, loan must end by age, FLPP income ceiling, minimum DP for KKB, emergency fund required before applying (our rule, 3 months). Readiness thresholds (our rules, `specs/03-snapshot-metrics.md`): expensive-debt rate (24%/yr), savings rate good (20%) and minimum (10%), maximum volatile share for a goal under three years away (20%).

Assumptions: KPR rate (fixed period, then floating), price growth per goal type (property, car, wedding), returns (money-market, deposit; volatile assets counted at 0% for goals under 3 years).

Every value marked `[__]` in the design must be looked up from BI, OJK or published bank criteria before the demo. LTV/DP rules in Indonesia have changed several times; do not rely on memory.

## `simulate()`

Pure function, no I/O, unit-tested.

```ts
simulate(profile, goal, rules, assumptions, changes): SimulationResult
```

- `profile`: the monthly snapshot (income, spending by class, debts, holdings).
- `goal`: type, target at goal date, payment preference, form fields.
- `changes`: a list of actions applied from a given month: `refinance_loan`, `pay_off_loan`, `cap_spending`, `move_assets`. Exact shapes and the month-by-month rules are in `specs/02-simulate.md`, which takes precedence over this summary.

Output:

```json
{
  "cash":  { "monthsToReady": 132, "timeline": [ … ] },
  "loan":  {
    "monthsToApproval": 14,
    "approvableToday": false,
    "blockedBy": [{ "rule": "dti_cap", "value": 0.42, "limit": 0.35 }],
    "installmentAtApproval": 9800000,
    "tenorYears": 20,
    "timeline": [{ "month": 1, "dti": 0.42, "emergencyMonths": 0.8, "dpSaved": 41200000, "passes": false, "failing": ["dti_cap", "emergency_fund"] }]
  },
  "rulesChecked": [{ "rule": "dti_cap", "valueUsed": 0.35, "you": 0.42, "effect": "blocks" }],
  "rejectedOptions": [{ "option": "tenor_25y", "rule": "loan_end_age" }]
}
```

`rulesChecked` and `rejectedOptions` feed the "See the rules used" panel on the result page.

## Recommendation agent

Gemini with `simulate` as a tool. Loop: propose an action → call `simulate` with it → keep it only if it moves a date or clears a block → explain. Return at most three actions, ordered by when to do them.

Action shape (renders the action cards):

```json
{
  "id": "a1",
  "title": "Refinance the Rp 12.4 m PayLater with a 12-month bank KTA",
  "impactLine": "Approval 8 months sooner",
  "description": "Same debt at roughly 13% instead of 31% …",
  "chips": ["DTI 42% → 35%", "Interest saved Rp 2.3 m", "Do this month"],
  "monthsSaved": 8,
  "verifiedBy": "simulate"
}
```

Numbers in `impactLine` and `chips` come from the simulation results, not from the model's text.

### Action choices

Each action is `undecided`, `committed` ("I'll do this") or `dismissed` ("Not for me"); Undo returns it to `undecided`.

- Plan line: months to approval assuming every non-dismissed action is taken. "With your choices: approval in N months (14 with all three) · X in your plan, Y skipped."
- Dismissed actions are stored as preferences so the agent does not propose them again. No alternative is generated after a skip.
- Committed actions are checked against next month's statements (is the PayLater balance gone? did the crypto move?) and reported as kept / not kept in the monthly delta.

## Monthly delta (stage 7)

Compare this month's snapshot with last month's: metrics that moved, committed actions kept or not, revised months-to-ready per active goal. Gemini writes the short summary; code supplies every number.

## Firestore (sketch)

- `users/{uid}`: profile.
- `users/{uid}/months/{yyyy-mm}`: snapshot (metrics), sources submitted.
- `users/{uid}/transactions`, `loans`, `holdings`: tagged with month and source.
- `users/{uid}/goals/{goalId}`: type, form fields, estimate (with `inputsUsed`), status (`draft|analysing|active`), next step for drafts.
- `users/{uid}/goals/{goalId}/analyses/{yyyy-mm}`: simulation result, actions, action choices.
- `users/{uid}/runs/{runId}`: status for the progress UI: `stage (reading|cleaning|checking|planning|done|failed)`, `percent`, `startedAt`, `goalIds`.
- `users/{uid}/overrides`: the user's rule and assumption overrides.
- `rules`: defaults with sources.

Documents table (`documents`) holds file metadata only; the file itself is gone after extraction.

## Unreadable files (decided 2026-10-18)

If a file can't be read (blurry screenshot, password-protected PDF), the pipeline continues with the readable files and flags the failed source: its `documents` record gets status `failed` with a reason, and the result page shows the source as missing, the same way a skipped source is shown on a monthly check-in. The run fails and the user goes back to the documents step only when nothing could be read, or when the bank statement failed on a first run.
