# 02 · Rules and `simulate()`

## Goal

A pure, tested function that plays a person's finances forward month by month and answers: in which month is this goal ready on each path, and what blocks it until then. Every month count, block and "approval N months sooner" shown in the app comes from here.

## Depends on

01-contracts. Background: `docs/analysis.md` ("Rules and assumptions", "`simulate()`").

## Rules and assumptions (data, not code)

Defaults live in `rules/` (Firestore) and in `shared/rules/defaults.json` for tests. Users may override any value (`users/{uid}/overrides`). `simulate()` receives the merged values.

| id | Meaning | Default |
|---|---|---|
| `dti_cap` | Max (all debt payments incl. new installment) / net income | 0.35 |
| `min_dp_first_home_new` | Minimum DP, first home, new build | 0.20 |
| `min_dp_other_home` | Minimum DP, secondary or second home | [__] |
| `loan_end_age` | Loan must end by this age | 55 |
| `flpp_income_ceiling` | Max monthly income for subsidised KPR | [__] |
| `min_dp_kkb` | Minimum DP, car loan | [__] |
| `kkb_max_tenor_years` | Longest car loan | [__] |
| `emergency_months_required` | Emergency fund before applying (our rule) | 3, or 6 if freelance |
| `kpr_rate_fixed` | KPR rate during the fixed period, used to qualify | 0.065 |
| `kpr_rate_floating` | KPR rate after the fixed period | 0.11 |
| `kpr_fixed_years` | Length of the fixed period | 3 |
| `kkb_rate` | Car loan rate | [__] |
| `growth_property` | Property price growth per year | 0.06 |
| `growth_car` | Car price growth per year | [__] |
| `growth_wedding` | Wedding cost growth per year | [__] |
| `return_money_market` | Return on liquid savings per year | 0.045 |

`[__]` values must be filled from a checked source before the demo. Until then, tests use the values in `fixtures/profiles/rules-test.json` (the defaults above with plausible placeholders, clearly marked as test-only). `shared/rules/defaults.json` leaves the `[__]` rules out: `simulate()` throws a clear error when a rule it needs is missing, so an unchecked value can never be guessed silently.

Data notes:

- `emergency_months_required` is stored as two records, `emergency_months_required` (3) and `emergency_months_required_freelance` (6); code picks one by `profile.employment` and reports the rule as `emergency_months_required`.
- The preferred loan tenor is `inputs.preferredTenorYears` on house and car goals (optional; default 20 years for a house, `kkb_max_tenor_years` for a car).
- `mergeRules(defaults, overrides)` in `shared/src/rules.ts` builds the flat map `simulate()` takes; overrides never change the defaults.

## Signature

```ts
simulate(input: {
  snapshot: Snapshot;            // starting month
  profile: Profile;
  goal: Goal;                    // with estimate
  rules: Record<string, number>; // merged defaults + overrides
  changes: Change[];             // actions to apply
  maxMonths?: number;            // default 360
}): SimulationResult
```

```ts
type Change =
  | { type: "refinance_loan"; loanId: string; newAnnualRate: number; newTenorMonths: number; fromMonth: number }
  | { type: "pay_off_loan"; loanId: string; fromMonth: number }           // pays outstanding from liquid assets
  | { type: "cap_spending"; category: string; monthlyCap: number; fromMonth: number }
  | { type: "move_assets"; amount: number; fromMonth: number };          // volatile → liquid

interface MonthState {
  month: number;                  // 0 = the snapshot month
  liquid: number;
  volatile: number;
  debtPayments: number;
  target: number;                 // goal price at this month
  dpNeeded?: number;
  installment?: number;
  dti?: number;
  emergencyMonths: number;
  failing: string[];              // rule ids failing this month
}

interface PathResult {
  monthsToReady: number | null;   // null = not within maxMonths
  timeline: MonthState[];
}

interface SimulationResult {
  cash: PathResult;
  loan?: PathResult & {           // absent for wedding
    approvableToday: boolean;
    blockedBy: { rule: string; value: number; limit: number }[];   // at month 0
    installmentAtApproval?: number;
    tenorYears?: number;
  };
  rulesChecked: { rule: string; valueUsed: number; you: number | string; effect: "blocks" | "sets_target" | "limits" | "rejects_option" | "passes" }[];
  rejectedOptions: { option: string; rule: string; reason: string }[];
}
```

## Behavior

Each month `m` from 0 to `maxMonths`:

1. **Apply changes** whose `fromMonth` equals `m`.
2. **Cash flow**: `surplus = netIncome − essential − discretionary (after caps) − cashWithdrawals − debtPayments`. Add `surplus` to `liquid`. Grow `liquid` by `return_money_market / 12`. `volatile` does not grow (counted at 0% return).
3. **Debts**: each loan pays its installment until its remaining tenor reaches 0; then its installment drops out of `debtPayments`. A refinance replaces rate, tenor and installment (annuity formula). A pay-off subtracts the outstanding from `liquid` and removes the loan.
4. **Target**: `target_m = targetToday × (1 + growth)^(m/12)` using the goal type's growth rule. Use `estimate.userOverride` instead of `targetToday` when set. Wedding target = cost − partnerShare − familyContribution.
5. **Emergency fund**: `emergencyMonths = liquid / essential`. Volatile assets never count toward it.
6. **Cash path ready** when `liquid − emergencyRequired × essential ≥ target_m`. Volatile assets count toward the target only if the goal date is 36 or more months away.
7. **Loan path** (house, car):
   - `dpNeeded = target_m × minDp` (rule by goal type, market and first-home flag).
   - Loan amount = `target_m − dpNeeded`. Tenor = `min(preferred 20 years for house / kkb_max_tenor for car, loan_end_age − ageAtMonth)`. Installment by the annuity formula at the qualifying rate (`kpr_rate_fixed` or `kkb_rate`).
   - `dti = (debtPayments + installment) / netIncome`, with `spouseMonthlyIncome` added only for a joint application.
   - Passes when: `dti ≤ dti_cap`, `liquid − emergencyRequired × essential ≥ dpNeeded`, `emergencyMonths ≥ emergencyRequired`.
   - Record failing rule ids in `failing` (`dti_cap`, `emergency_months_required`, and the DP rule id that applied). The first passing month is `monthsToReady`.
8. **Options** recorded in `rejectedOptions` with the rule that rejects them: joint application when single, preferred tenor longer than allowed by `loan_end_age`, FLPP when income is above `flpp_income_ceiling` or the home is not a first home.

Annuity: `installment = P × r / (1 − (1 + r)^−n)`, `r` = annual rate / 12, `n` = months.

`simulate()` does no I/O, no clock reads, no randomness. Same input, same output.

## Fixtures

All fixtures are `{ name, description, snapshot, profile, goal }` JSON files loaded by the tests. Note: with the default rules House-A never reaches KPR approval. Liquid savings cover the DP from about month 50, but the loan must end by 55, so the tenor shrinks every year and the DTI is back above the cap from month 40. Tests that need a finite approval month use House-A with Rp 60,000,000 liquid (approval in month 34). Besides House-A: `car-b.json` (new car on a KKB, married, single applicant), `wedding-c.json` (cash wedding with partner and family shares, no loan path), `freelancer-d.json` (freelance income, secondary-market apartment, joint KPR, six-month emergency rule).

`fixtures/profiles/house-a.json`: net income Rp 18,000,000; essential Rp 8,000,000; discretionary Rp 5,000,000 (food delivery Rp 1,400,000); cash withdrawals Rp 500,000; one PayLater loan, outstanding Rp 12,400,000, installment Rp 2,100,000, 31% per year, 8 months left; liquid Rp 4,000,000; volatile Rp 15,000,000; age 35, permanent, single. Goal: first home, new build, target Rp 800,000,000 today, growth 6%, KPR preference. Monthly surplus before changes: Rp 2,400,000.

## Acceptance criteria

- `annuity(640_000_000, 0.065, 240)` = 4,771,668 (±1).
- House-A, no changes: `loan.approvableToday` is false and `blockedBy` contains `dti_cap` (DTI ≈ 0.382), `emergency_months_required` (0.5 months) and `min_dp_first_home_new` (Rp 160 m needed).
- House-A with `refinance_loan` to an installment of about Rp 1,100,000: month-0 DTI ≈ 0.326, so `dti_cap` no longer appears in month 0's `failing`.
- Adding any change in this spec never makes `loan.monthsToReady` larger for House-A (monotonicity tests for each change type).
- Raising `dti_cap` never makes `loan.monthsToReady` larger; raising `growth_property` never makes it smaller.
- A wedding goal returns no `loan` field.
- A single applicant asking for a joint application gets `rejectedOptions` with `joint_application`; age 35 with a 25-year preference gets `tenor` rejected by `loan_end_age`.
- When the PayLater's remaining tenor ends, `debtPayments` drops by its installment in the following month.
- If never ready within `maxMonths`, `monthsToReady` is `null`, not a large number.
- Calling twice with the same input returns deeply equal results.

## Tasks

1. Rules defaults file, override merging, and `fixtures/profiles/` (House-A, a car profile, a wedding profile, a freelancer).
2. Annuity and growth helpers with tests.
3. The month loop for the cash path.
4. The loan path, `blockedBy`, `rulesChecked`.
5. The four change types.
6. `rejectedOptions`.
7. Property tests (monotonicity, determinism).

## Out of scope

Taxes, insurance, property fees, rate changes after the fixed period inside the qualification check (the floating rate is shown in the UI only), cross-goal budget sharing.
