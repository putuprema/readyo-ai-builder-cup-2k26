import { firestorePaths } from "../paths.js";
import { simulate } from "../simulate/simulate.js";
import type {
  ActionCard,
  Analysis,
  Change,
  DocumentRecord,
  Goal,
  Holding,
  Loan,
  Metric,
  MonthRecord,
  Profile,
  RunStatus,
  SimulationResult,
  Snapshot,
  Transaction,
} from "../types.js";
import { demoRules } from "./rules.js";

// One demo user with an active house goal and its September 2026 analysis, so UI work can
// start before the pipeline exists (specs/01-contracts.md, task 4). The snapshot, profile,
// goal, metrics and action cards are sample data chosen to be internally consistent; both
// simulation results are real simulate() output over that data (see index.test.ts). The demo
// story from docs/product.md: the PayLater pushes DTI over the cap, the plan clears it and
// brings approval from month 26 to month 14.

export { demoRuleDefaults, demoRules } from "./rules.js";

export const DEMO_UID = "demo-user";
export const DEMO_EMAIL = "demo@adidi.app";
export const DEMO_DISPLAY_NAME = "Dimas";
export const DEMO_MONTH = "2026-09";
export const DEMO_GOAL_ID = "house-tangsel";

const SUBMITTED_AT = "2026-10-03T09:12:00.000Z";
const CREATED_AT = "2026-10-03T08:40:00.000Z";

export const demoProfile: Profile = {
  age: 31,
  employment: "permanent",
  netMonthlyIncome: 28_000_000,
  maritalStatus: "single",
  dependents: 0,
  city: "Tangerang Selatan",
};

export const demoGoal: Goal = {
  id: DEMO_GOAL_ID,
  type: "house",
  status: "active",
  payPreference: "loan",
  inputs: {
    area: "Tangerang Selatan",
    propertyType: "landed",
    landM2: 72,
    buildingM2: 60,
    market: "new",
    firstHome: true,
    targetYear: 2028,
    joint: "not_married",
  },
  estimate: {
    targetToday: 1_350_000_000,
    rangeLow: 1_100_000_000,
    rangeHigh: 1_600_000_000,
    growthRatePerYear: 0.06,
    targetAtGoalDate: 1_516_860_000,
    sources: [
      {
        title: "Rumah123: new landed houses, Tangerang Selatan, 60/72 m2",
        url: "https://www.rumah123.com/",
        date: "2026-10",
      },
      {
        title: "Bank Indonesia residential property price survey, Q2 2026",
        url: "https://www.bi.go.id/",
        date: "2026-08",
      },
    ],
    inputsUsed: {
      area: "Tangerang Selatan",
      propertyType: "landed",
      landM2: 72,
      buildingM2: 60,
      market: "new",
      targetYear: 2028,
    },
    calculatedAt: "2026-10-03T08:46:00.000Z",
  },
  createdAt: CREATED_AT,
  updatedAt: SUBMITTED_AT,
  latestAnalysisMonth: DEMO_MONTH,
};

export const demoDocuments: DocumentRecord[] = [
  doc("doc-bca", "BCA e-statement September 2026.pdf", "application/pdf", 412_338, "bank"),
  doc("doc-gopay", "GoPay history September.png", "image/png", 188_204, "ewallet"),
  doc("doc-kredivo", "Kredivo bill October.png", "image/png", 142_990, "paylater"),
  doc("doc-bibit", "Bibit portfolio.png", "image/png", 201_544, "investment"),
  doc("doc-indodax", "Indodax wallet.png", "image/png", 97_310, "investment"),
];

function doc(
  id: string,
  name: string,
  type: string,
  size: number,
  sourceKind: DocumentRecord["sourceKind"],
): DocumentRecord {
  return {
    id,
    name,
    type,
    size,
    sourceKind,
    month: DEMO_MONTH,
    status: "extracted",
    createdAt: CREATED_AT,
  };
}

export const demoLoans: Loan[] = [
  {
    id: "loan-kredivo",
    month: DEMO_MONTH,
    lender: "Kredivo",
    type: "paylater",
    outstandingPrincipal: 12_400_000,
    monthlyInstallment: 2_100_000,
    effectiveAnnualRate: 0.31,
    remainingTenorMonths: 7,
    sourceFileId: "doc-kredivo",
  },
];

export const demoHoldings: Holding[] = [
  holding("hold-bca", "Savings account", "BCA", 26_200_000, "cash", false, "doc-bca"),
  holding("hold-bibit-mm", "Money-market fund", "Bibit", 15_000_000, "liquid", false, "doc-bibit"),
  holding("hold-bibit-stock", "Equity fund", "Bibit", 65_000_000, "liquid", true, "doc-bibit"),
  holding(
    "hold-indodax",
    "Crypto (BTC, ETH)",
    "Indodax",
    40_000_000,
    "liquid",
    true,
    "doc-indodax",
  ),
];

function holding(
  id: string,
  instrument: string,
  provider: string,
  currentValue: number,
  liquidityClass: Holding["liquidityClass"],
  volatile: boolean,
  sourceFileId: string,
): Holding {
  return {
    id,
    month: DEMO_MONTH,
    instrument,
    provider,
    currentValue,
    liquidityClass,
    volatile,
    sourceFileId,
  };
}

const discretionaryByCategory = {
  food_delivery: 1_400_000,
  shopping: 2_400_000,
  entertainment: 1_000_000,
  transport: 1_600_000,
  subscriptions: 600_000,
};

export const demoSnapshot: Snapshot = {
  month: DEMO_MONTH,
  netIncome: 28_000_000,
  essentialSpending: 9_000_000,
  discretionarySpending: 7_000_000,
  discretionaryByCategory,
  cashWithdrawals: 500_000,
  debtPayments: 2_100_000,
  loans: demoLoans,
  liquidAssets: 41_200_000,
  volatileAssets: 105_000_000,
  estimatedSources: [],
};

export const demoMonth: MonthRecord = {
  snapshot: demoSnapshot,
  sources: demoDocuments.map((d) => ({ kind: d.sourceKind, documentId: d.id, name: d.name })),
  submittedAt: SUBMITTED_AT,
};

// A few representative transactions; real extraction produces every line of the month.
export const demoTransactions: Transaction[] = [
  tx(
    "tx-01",
    "2026-09-01",
    28_000_000,
    "in",
    "PT Maju Digital Nusantara",
    "GAJI SEP 2026",
    "BCA ****4821",
    "doc-bca",
    "income",
    "salary",
    true,
  ),
  tx(
    "tx-02",
    "2026-09-02",
    3_500_000,
    "out",
    "Griya Asri Residence",
    "SEWA KOST SEP",
    "BCA ****4821",
    "doc-bca",
    "essential",
    "rent",
    true,
  ),
  tx(
    "tx-03",
    "2026-09-03",
    2_100_000,
    "out",
    "Kredivo",
    "KREDIVO CICILAN 3/10",
    "BCA ****4821",
    "doc-bca",
    "debt_payment",
    "paylater",
    true,
  ),
  tx(
    "tx-04",
    "2026-09-05",
    2_000_000,
    "out",
    "GoPay",
    "TOPUP GOPAY",
    "BCA ****4821",
    "doc-bca",
    "own_transfer",
    "topup",
    true,
  ),
  tx(
    "tx-05",
    "2026-09-05",
    2_000_000,
    "in",
    "BCA",
    "Top up from BCA",
    "GoPay ****7731",
    "doc-gopay",
    "own_transfer",
    "topup",
    true,
  ),
  tx(
    "tx-06",
    "2026-09-06",
    86_000,
    "out",
    "GoFood",
    "GoFood - Sate Khas Senayan",
    "GoPay ****7731",
    "doc-gopay",
    "discretionary",
    "food_delivery",
    false,
  ),
  tx(
    "tx-07",
    "2026-09-10",
    500_000,
    "out",
    "ATM BCA",
    "TARIKAN ATM",
    "BCA ****4821",
    "doc-bca",
    "cash",
    "cash",
    false,
  ),
  tx(
    "tx-08",
    "2026-09-12",
    1_200_000,
    "out",
    "PLN / Indihome",
    "TAGIHAN LISTRIK INTERNET",
    "BCA ****4821",
    "doc-bca",
    "essential",
    "utilities",
    true,
  ),
  tx(
    "tx-09",
    "2026-09-15",
    2_000_000,
    "out",
    "Bibit",
    "PEMBELIAN REKSA DANA",
    "BCA ****4821",
    "doc-bca",
    "investment",
    "mutual_fund",
    true,
  ),
  tx(
    "tx-10",
    "2026-09-20",
    649_000,
    "out",
    "Tokopedia",
    "TOKOPEDIA ORDER",
    "BCA ****4821",
    "doc-bca",
    "discretionary",
    "shopping",
    false,
  ),
  tx(
    "tx-11",
    "2026-09-27",
    189_000,
    "out",
    "Netflix / Spotify",
    "NETFLIX.COM",
    "BCA ****4821",
    "doc-bca",
    "discretionary",
    "subscriptions",
    true,
  ),
];

function tx(
  id: string,
  date: string,
  amount: number,
  direction: Transaction["direction"],
  counterparty: string,
  rawDescription: string,
  sourceAccount: string,
  sourceFileId: string,
  cls: Transaction["cls"],
  category: string,
  recurring: boolean,
): Transaction {
  return {
    id,
    month: DEMO_MONTH,
    date,
    amount,
    direction,
    counterparty,
    rawDescription,
    sourceAccount,
    sourceFileId,
    cls,
    category,
    recurring,
  };
}

// Seven readiness metrics (docs/analysis.md). "you" values follow the snapshot above.
export const demoMetrics: Metric[] = [
  {
    id: "net_income",
    label: "Verified net income",
    you: 28_000_000,
    status: "passes",
    meaning: "Recurring salary from one employer, own transfers excluded.",
  },
  {
    id: "savings_rate",
    label: "Savings rate",
    you: 0.336,
    rule: 0.2,
    status: "passes",
    meaning: "You keep about a third of your income after spending and debt payments.",
  },
  {
    id: "emergency_fund",
    label: "Emergency fund",
    you: 4.6,
    rule: 3,
    status: "passes",
    meaning: "Liquid savings cover 4.6 months of essential spending.",
  },
  {
    id: "dti",
    label: "Debt-to-income",
    you: 0.363,
    rule: 0.35,
    status: "blocks",
    meaning: "The Kredivo installment plus the KPR installment would take 36% of your income.",
  },
  {
    id: "expensive_debt",
    label: "Expensive debt",
    you: 12_400_000,
    rule: 0,
    status: "blocks",
    meaning: "Rp 12.4 m outstanding at 31% a year. Banks want this cleared before a KPR.",
  },
  {
    id: "goal_funding",
    label: "Down payment progress",
    you: 0.153,
    rule: 1,
    status: "needs_work",
    meaning: "Rp 41.2 m saved of the Rp 270 m down payment (20% of the price today).",
  },
  {
    id: "horizon_risk",
    label: "Horizon vs risk",
    you: 0.72,
    rule: 0.2,
    status: "needs_work",
    meaning: "72% of your savings are in crypto and stocks, with the goal under three years away.",
  },
];

export const demoActions: ActionCard[] = [
  {
    id: "a1",
    title: "Refinance the Rp 12.4 m Kredivo balance with a 12-month bank KTA",
    impactLine: "Clears the DTI block this month",
    description:
      "The same debt at about 13% instead of 31%: the installment drops from Rp 2.1 m to Rp 1.1 m and your debt-to-income goes under the 35% cap.",
    chips: ["DTI 36% → 33%", "Interest saved Rp 1.9 m", "Do this month"],
    monthsSaved: 1,
    change: {
      type: "refinance_loan",
      loanId: "loan-kredivo",
      newAnnualRate: 0.13,
      newTenorMonths: 12,
      fromMonth: 0,
    },
  },
  {
    id: "a2",
    title: "Move Rp 105 m of crypto and equity funds into a money-market fund",
    impactLine: "Approval 10 months sooner",
    description:
      "With the goal under three years away, volatile assets do not count toward the down payment. Moved to a money-market fund they count in full.",
    chips: ["DP progress 15% → 54%", "Volatile share 72% → 0%", "Do this month"],
    monthsSaved: 10,
    change: { type: "move_assets", amount: 105_000_000, fromMonth: 0 },
  },
  {
    id: "a3",
    title: "Cap food delivery at Rp 500 k a month",
    impactLine: "Approval 2 months sooner",
    description:
      "Food delivery was Rp 1.4 m in September. Capping it adds Rp 900 k a month to the down payment.",
    chips: ["Saves Rp 900 k a month", "Savings rate 34% → 37%", "From next month"],
    monthsSaved: 2,
    change: { type: "cap_spending", category: "food_delivery", monthlyCap: 500_000, fromMonth: 1 },
  },
];

// Both simulation results come from simulate() over the data above with the demo rules, so
// the UI built on the demo sees exactly what the pipeline will produce: full timelines (every
// month to 360) for the cash and loan paths, blockedBy, rulesChecked and rejectedOptions. The
// action cards' monthsSaved and the summary are checked against these results in index.test.ts.
const demoChanges: Change[] = demoActions.map((a) => a.change);

export const demoWithoutPlan: SimulationResult = simulate({
  snapshot: demoSnapshot,
  profile: demoProfile,
  goal: demoGoal,
  rules: demoRules,
  changes: [],
});

export const demoWithPlan: SimulationResult = simulate({
  snapshot: demoSnapshot,
  profile: demoProfile,
  goal: demoGoal,
  rules: demoRules,
  changes: demoChanges,
});

export const demoAnalysis: Analysis = {
  goalId: DEMO_GOAL_ID,
  month: DEMO_MONTH,
  metrics: demoMetrics,
  withoutPlan: demoWithoutPlan,
  withPlan: demoWithPlan,
  actions: demoActions,
  choices: { a1: "undecided", a2: "undecided", a3: "undecided" },
  rejectedOptions: demoWithoutPlan.rejectedOptions,
  summary:
    "You're 14 months from a KPR if you clear the Kredivo balance and move your crypto to safer savings; 26 months if nothing changes.",
};

export const demoRun: RunStatus = {
  id: "run-first",
  stage: "done",
  percent: 100,
  startedAt: SUBMITTED_AT,
  goalIds: [DEMO_GOAL_ID],
  month: DEMO_MONTH,
  kind: "first",
};

export interface SeedDocument {
  path: string;
  data: Record<string, unknown>;
}

/**
 * Every Firestore document of the demo user, keyed by its path from the layout. Each document
 * is a plain JSON copy: Firestore rejects `undefined` values, and simulate() leaves
 * `installment` and `dti` undefined in the months where no tenor is allowed any more.
 */
export function demoSeedDocuments(uid: string = DEMO_UID): SeedDocument[] {
  const docs: SeedDocument[] = [
    { path: firestorePaths.user(uid), data: plain(demoProfile) },
    { path: firestorePaths.month(uid, DEMO_MONTH), data: plain(demoMonth) },
    { path: firestorePaths.goal(uid, demoGoal.id), data: plain(demoGoal) },
    { path: firestorePaths.analysis(uid, demoGoal.id, DEMO_MONTH), data: plain(demoAnalysis) },
    { path: firestorePaths.run(uid, demoRun.id), data: plain(demoRun) },
  ];
  for (const t of demoTransactions)
    docs.push({ path: firestorePaths.transaction(uid, t.id), data: plain(t) });
  for (const l of demoLoans) docs.push({ path: firestorePaths.loan(uid, l.id), data: plain(l) });
  for (const h of demoHoldings)
    docs.push({ path: firestorePaths.holding(uid, h.id), data: plain(h) });
  for (const d of demoDocuments)
    docs.push({ path: firestorePaths.document(uid, d.id), data: plain(d) });
  return docs;
}

/** A deep copy with every `undefined` property dropped, as Firestore stores it. */
function plain(value: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
