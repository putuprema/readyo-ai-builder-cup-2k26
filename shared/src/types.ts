// Shared contracts for web, api and worker. Source of truth: specs/01-contracts.md
// (and specs/02-simulate.md for Change and SimulationResult).
//
// Conventions: all money is an integer number of rupiah; all months are "YYYY-MM" strings;
// all timestamps are ISO strings.

export type GoalType = "house" | "car" | "wedding";
export type GoalStatus = "draft" | "analysing" | "active";
export type DraftStep = "estimate" | "documents";
export type PayPreference = "cash" | "loan" | "none";

export interface Profile {
  age: number;
  employment: "permanent" | "contract" | "freelance";
  netMonthlyIncome: number; // confirmed by the user
  maritalStatus: "single" | "married";
  dependents: number;
  spouseMonthlyIncome?: number;
  city: string;
}

export interface HouseInputs {
  area: string;
  propertyType: "landed" | "apartment";
  landM2?: number;
  buildingM2?: number;
  budgetRange?: [number, number];
  market: "new" | "secondary";
  firstHome: boolean;
  targetYear: number;
  plannedDp?: number;
  joint?: "not_married" | "joint" | "single_applicant";
  preferredTenorYears?: number; // default 20 (specs/02-simulate.md)
}

export interface CarInputs {
  condition: "new" | "used";
  modelOrSegment: string;
  budgetRange?: [number, number];
  city: string;
  targetYear: number;
  plannedDp?: number;
  tradeInValue?: number;
  preferredTenorYears?: number; // default kkb_max_tenor_years (specs/02-simulate.md)
}

export interface WeddingInputs {
  targetMonth: string;
  city: string;
  guests: number;
  scale: "intimate" | "standard" | "large";
  partnerShare: number;
  familyContribution: number;
  honeymoon: "no" | "domestic" | "abroad";
  honeymoonBudget?: number;
}

export type GoalInputs = HouseInputs | CarInputs | WeddingInputs;

export interface Estimate {
  targetToday: number;
  rangeLow: number;
  rangeHigh: number;
  growthRatePerYear: number;
  targetAtGoalDate: number;
  userOverride?: number; // the user typed their own price
  sources: { title: string; url: string; date: string }[];
  inputsUsed: Record<string, unknown>; // for stale detection
  calculatedAt: string; // ISO timestamp
}

export interface Goal {
  id: string;
  type: GoalType;
  status: GoalStatus;
  draftStep?: DraftStep;
  payPreference: PayPreference; // "none" for wedding
  inputs: HouseInputs | CarInputs | WeddingInputs;
  estimate?: Estimate;
  createdAt: string;
  updatedAt: string;
  latestAnalysisMonth?: string;
}

export type TransactionClass =
  | "income"
  | "essential"
  | "discretionary"
  | "debt_payment"
  | "investment"
  | "own_transfer"
  | "cash";

export interface Transaction {
  id: string;
  month: string;
  date: string;
  amount: number;
  direction: "in" | "out";
  counterparty: string;
  rawDescription: string;
  sourceAccount: string;
  sourceFileId: string;
  cls?: TransactionClass;
  category?: string;
  recurring?: boolean;
}

export type LoanType = "paylater" | "pinjol" | "kta" | "other";

export interface Loan {
  id: string;
  month: string;
  lender: string;
  type: LoanType;
  outstandingPrincipal: number;
  monthlyInstallment: number;
  effectiveAnnualRate: number;
  remainingTenorMonths: number;
  sourceFileId: string;
}

export type LiquidityClass = "cash" | "liquid" | "locked";

export interface Holding {
  id: string;
  month: string;
  instrument: string;
  provider: string;
  currentValue: number; // rupiah; converted with the FX assumption when the statement is in another currency
  currency?: string; // ISO 4217 code when the statement is not in rupiah (e.g. "USD")
  nativeValue?: number; // value in that currency, as printed
  liquidityClass: LiquidityClass;
  volatile: boolean;
  sourceFileId: string;
}

export interface Snapshot {
  month: string;
  netIncome: number; // the profile's confirmed income, or the computed one when none is confirmed
  computedNetIncome?: number; // income transactions this month, own transfers excluded (for display)
  essentialSpending: number;
  discretionarySpending: number;
  discretionaryByCategory: Record<string, number>;
  cashWithdrawals: number;
  debtPayments: number;
  loans: Loan[];
  liquidAssets: number; // cash + liquid, non-volatile, including bank balances
  bankBalances?: number; // the part of liquidAssets that is bank and e-wallet balances
  volatileAssets: number;
  incomeVariability?: number; // freelancers: std dev / mean of net income over the months available
  estimatedSources: string[]; // source kinds carried from last month (SourceKind values)
}

export type RuleUnit = "ratio" | "years" | "months" | "rupiah" | "rate";

export interface RuleValue {
  id: string;
  label: string;
  value: number;
  unit: RuleUnit;
  usedFor: string[];
  source: { title: string; url: string };
  checkedAt: string;
}

export type MetricStatus = "passes" | "needs_work" | "blocks";

export interface Metric {
  id: string;
  label: string;
  you: number;
  rule?: number;
  status: MetricStatus;
  meaning: string;
}

// ---- simulate() contracts (specs/02-simulate.md) ----

export type Change =
  | {
      type: "refinance_loan";
      loanId: string;
      newAnnualRate: number;
      newTenorMonths: number;
      fromMonth: number;
    }
  | { type: "pay_off_loan"; loanId: string; fromMonth: number } // pays outstanding from liquid assets
  | { type: "cap_spending"; category: string; monthlyCap: number; fromMonth: number }
  | { type: "move_assets"; amount: number; fromMonth: number }; // volatile → liquid

export interface MonthState {
  month: number; // 0 = the snapshot month
  liquid: number;
  volatile: number;
  debtPayments: number;
  target: number; // goal price at this month
  dpNeeded?: number; // the minimum DP the rules require (loan path)
  dpPaid?: number; // the DP the person would pay: earmarked savings, capped by plannedDp, at least dpNeeded
  installment?: number; // on target − dpPaid
  dti?: number;
  emergencyMonths: number;
  failing: string[]; // rule ids failing this month
}

export interface PathResult {
  monthsToReady: number | null; // null = not within maxMonths
  timeline: MonthState[];
}

export type RuleEffect = "blocks" | "sets_target" | "limits" | "rejects_option" | "passes";

export interface LoanPathResult extends PathResult {
  approvableToday: boolean;
  blockedBy: { rule: string; value: number; limit: number }[]; // at month 0
  installmentAtApproval?: number;
  tenorYears?: number;
}

export interface SimulationResult {
  cash: PathResult;
  loan?: LoanPathResult; // absent for wedding
  rulesChecked: { rule: string; valueUsed: number; you: number | string; effect: RuleEffect }[];
  rejectedOptions: { option: string; rule: string; reason: string }[];
}

// ---- analysis and runs ----

export interface ActionCard {
  id: string;
  title: string;
  impactLine: string;
  description: string;
  chips: string[];
  monthsSaved: number;
  change: Change; // the simulate() change it represents
}

export type ActionChoice = "undecided" | "committed" | "dismissed";

export interface Analysis {
  goalId: string;
  month: string;
  metrics: Metric[];
  withoutPlan: SimulationResult;
  withPlan: SimulationResult;
  actions: ActionCard[];
  choices: Record<string, ActionChoice>;
  rejectedOptions: { option: string; rule: string; reason: string }[];
  summary: string; // Gemini-written headline sentence
}

export type RunStage = "reading" | "cleaning" | "checking" | "planning" | "done" | "failed";
export type RunKind = "first" | "monthly" | "reuse" | "recalculate";

export interface RunStatus {
  id: string;
  stage: RunStage;
  percent: number;
  startedAt: string;
  goalIds: string[];
  month: string;
  kind: RunKind;
  error?: string;
}

// ---- Firestore records that only the layout section of the spec describes ----

export type SourceKind = "bank" | "ewallet" | "paylater" | "pinjol" | "investment";
export type DocumentStatus = "uploading" | "uploaded" | "extracted" | "failed" | "deleted";

/** users/{uid}/documents/{id}: file metadata only; the file itself is deleted after extraction. */
export interface DocumentRecord {
  id: string;
  name: string;
  type: string; // MIME type: application/pdf, image/png, image/jpeg
  size: number; // bytes
  sourceKind: SourceKind;
  month: string;
  status: DocumentStatus;
  reason?: string; // why extraction failed, when status is "failed"
  createdAt: string;
}

/** users/{uid}/months/{YYYY-MM}: the snapshot plus the sources submitted for that month. */
export interface MonthRecord {
  snapshot: Snapshot;
  sources: { kind: SourceKind; documentId: string; name: string }[];
  submittedAt: string;
}

/** users/{uid}/overrides/{ruleId}: the user's own value for a rule or assumption. */
export interface Override {
  ruleId: string;
  value: number;
  updatedAt: string;
}
