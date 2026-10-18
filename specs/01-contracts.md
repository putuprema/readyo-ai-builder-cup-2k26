# 01 · Contracts

## Goal

Fix the shared types, the Firestore layout and the API endpoints so the UI, the backend and the AI pipeline can be built in parallel and still fit together.

## Depends on

00-foundation. Background: `docs/product.md` (goals, lifecycle, data ownership), `docs/analysis.md` (pipeline, Firestore sketch).

## Types

Written in `shared/types` (TypeScript shown; mirror in Python if the backend is Python). All money is an integer number of rupiah. All months are `"YYYY-MM"` strings.

```ts
type GoalType = "house" | "car" | "wedding";
type GoalStatus = "draft" | "analysing" | "active";
type DraftStep = "estimate" | "documents";
type PayPreference = "cash" | "loan" | "none";

interface Profile {
  age: number;
  employment: "permanent" | "contract" | "freelance";
  netMonthlyIncome: number;          // confirmed by the user
  maritalStatus: "single" | "married";
  dependents: number;
  spouseMonthlyIncome?: number;
  city: string;
}

interface HouseInputs { area: string; propertyType: "landed" | "apartment"; landM2?: number; buildingM2?: number; budgetRange?: [number, number]; market: "new" | "secondary"; firstHome: boolean; targetYear: number; plannedDp?: number; joint?: "not_married" | "joint" | "single_applicant"; }
interface CarInputs { condition: "new" | "used"; modelOrSegment: string; budgetRange?: [number, number]; city: string; targetYear: number; plannedDp?: number; tradeInValue?: number; }
interface WeddingInputs { targetMonth: string; city: string; guests: number; scale: "intimate" | "standard" | "large"; partnerShare: number; familyContribution: number; honeymoon: "no" | "domestic" | "abroad"; honeymoonBudget?: number; }

interface Estimate {
  targetToday: number;
  rangeLow: number;
  rangeHigh: number;
  growthRatePerYear: number;
  targetAtGoalDate: number;
  userOverride?: number;               // the user typed their own price
  sources: { title: string; url: string; date: string }[];
  inputsUsed: Record<string, unknown>; // for stale detection
  calculatedAt: string;                // ISO timestamp
}

interface Goal {
  id: string;
  type: GoalType;
  status: GoalStatus;
  draftStep?: DraftStep;
  payPreference: PayPreference;        // "none" for wedding
  inputs: HouseInputs | CarInputs | WeddingInputs;
  estimate?: Estimate;
  createdAt: string;
  updatedAt: string;
  latestAnalysisMonth?: string;
}

interface Transaction { id: string; month: string; date: string; amount: number; direction: "in" | "out"; counterparty: string; rawDescription: string; sourceAccount: string; sourceFileId: string; cls?: "income" | "essential" | "discretionary" | "debt_payment" | "investment" | "own_transfer" | "cash"; category?: string; recurring?: boolean; }
interface Loan { id: string; month: string; lender: string; type: "paylater" | "pinjol" | "kta" | "other"; outstandingPrincipal: number; monthlyInstallment: number; effectiveAnnualRate: number; remainingTenorMonths: number; sourceFileId: string; }
interface Holding { id: string; month: string; instrument: string; provider: string; currentValue: number; liquidityClass: "cash" | "liquid" | "locked"; volatile: boolean; sourceFileId: string; }

interface Snapshot {
  month: string;
  netIncome: number;
  essentialSpending: number;
  discretionarySpending: number;
  discretionaryByCategory: Record<string, number>;
  cashWithdrawals: number;
  debtPayments: number;
  loans: Loan[];
  liquidAssets: number;                // cash + liquid, non-volatile
  volatileAssets: number;
  incomeVariability?: number;          // freelancers
  estimatedSources: string[];          // sources carried from last month
}

interface RuleValue { id: string; label: string; value: number; unit: "ratio" | "years" | "months" | "rupiah" | "rate"; usedFor: string[]; source: { title: string; url: string }; checkedAt: string; }

type MetricStatus = "passes" | "needs_work" | "blocks";
interface Metric { id: string; label: string; you: number; rule?: number; status: MetricStatus; meaning: string; }

interface ActionCard {
  id: string;
  title: string;
  impactLine: string;
  description: string;
  chips: string[];
  monthsSaved: number;
  change: Change;                      // the simulate() change it represents
}
type ActionChoice = "undecided" | "committed" | "dismissed";

interface Analysis {
  goalId: string;
  month: string;
  metrics: Metric[];
  withoutPlan: SimulationResult;
  withPlan: SimulationResult;
  actions: ActionCard[];
  choices: Record<string, ActionChoice>;
  rejectedOptions: { option: string; rule: string; reason: string }[];
  summary: string;                     // Gemini-written headline sentence
}

type RunStage = "reading" | "cleaning" | "checking" | "planning" | "done" | "failed";
interface RunStatus { id: string; stage: RunStage; percent: number; startedAt: string; goalIds: string[]; month: string; kind: "first" | "monthly" | "reuse" | "recalculate"; error?: string; }
```

`Change` and `SimulationResult` are defined in `specs/02-simulate.md`.

## Firestore layout

```
users/{uid}                              Profile
users/{uid}/months/{YYYY-MM}             Snapshot + list of submitted sources
users/{uid}/transactions/{id}            Transaction
users/{uid}/loans/{id}                   Loan
users/{uid}/holdings/{id}                Holding
users/{uid}/documents/{id}               file metadata only (name, type, size, source kind, month, status)
users/{uid}/goals/{goalId}               Goal
users/{uid}/goals/{goalId}/analyses/{YYYY-MM}   Analysis
users/{uid}/runs/{runId}                 RunStatus
users/{uid}/overrides/{ruleId}           user's own rule or assumption value
rules/{ruleId}                           RuleValue defaults
```

Security rules: a user reads and writes only under `users/{uid}`; `rules/` is read-only to clients.

## API endpoints (`api/`)

| Method | Path | Does |
|---|---|---|
| POST | `/goals` | Create a draft goal |
| PATCH | `/goals/:id` | Update inputs, pay preference, user price override |
| DELETE | `/goals/:id` | Delete (refuse while `analysing`) |
| POST | `/goals/:id/estimate` | Run pricing (stage 1) and store the estimate |
| POST | `/uploads` | Signed URL for one file; creates a `documents` record |
| DELETE | `/uploads/:docId` | Remove a file before submit |
| POST | `/runs` | Submit: `{ kind, goalIds, month, documentIds? }`; enqueues a Cloud Task, returns `runId` |
| PATCH | `/goals/:id/analyses/:month/choices` | Set an action to committed / dismissed / undecided |
| PUT | `/overrides/:ruleId` | Set or clear a user override |
| POST | `/recalculate` | Re-run stages 5–6 for all active goals after override changes |

Read-only data (goals, analyses, run status) is read by the web app directly from Firestore with listeners.

## Acceptance criteria

- `shared/types` compiles and is imported by `web`, `api` and `worker`.
- Firestore security rules deny reading another user's data (rules test).
- Every endpoint exists, validates its input against the types, and returns 401 without a Firebase ID token.
- A seed script creates one demo user with an active house goal and its analysis, using sample data, so UI work can start before the pipeline exists.

## Tasks

1. Write `shared/types` exactly as above.
2. Firestore security rules + rules tests.
3. `api/` endpoints as stubs with input validation and auth.
4. Seed script for the demo user.

## Out of scope

Endpoint logic beyond validation and stubs; real pipeline.
