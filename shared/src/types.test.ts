import { describe, expect, it } from "vitest";
import { firestorePaths, isMonthKey } from "./paths.js";
import type { Analysis, Goal, RunStatus, Snapshot } from "./types.js";

// These objects are checked by the compiler against the shared contracts. The runtime
// assertions only pin down a few invariants of the sample shapes.

const goal: Goal = {
  id: "g1",
  type: "house",
  status: "active",
  payPreference: "loan",
  inputs: {
    area: "Tangerang Selatan",
    propertyType: "landed",
    market: "new",
    firstHome: true,
    targetYear: 2029,
  },
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  latestAnalysisMonth: "2026-09",
};

const snapshot: Snapshot = {
  month: "2026-09",
  netIncome: 18_000_000,
  essentialSpending: 8_000_000,
  discretionarySpending: 5_000_000,
  discretionaryByCategory: { food_delivery: 1_400_000 },
  cashWithdrawals: 500_000,
  debtPayments: 2_100_000,
  loans: [],
  liquidAssets: 4_000_000,
  volatileAssets: 15_000_000,
  estimatedSources: [],
};

const analysis: Analysis = {
  goalId: goal.id,
  month: snapshot.month,
  metrics: [],
  withoutPlan: {
    cash: { monthsToReady: null, timeline: [] },
    rulesChecked: [],
    rejectedOptions: [],
  },
  withPlan: { cash: { monthsToReady: null, timeline: [] }, rulesChecked: [], rejectedOptions: [] },
  actions: [],
  choices: {},
  rejectedOptions: [],
  summary: "",
};

const run: RunStatus = {
  id: "r1",
  stage: "reading",
  percent: 0,
  startedAt: "2026-10-01T00:00:00.000Z",
  goalIds: [goal.id],
  month: "2026-09",
  kind: "first",
};

describe("shared types", () => {
  it("sample objects satisfy the contracts", () => {
    expect(goal.type).toBe("house");
    expect(analysis.goalId).toBe(goal.id);
    expect(run.goalIds).toContain(goal.id);
    expect(snapshot.netIncome).toBe(18_000_000);
  });
});

describe("firestorePaths", () => {
  it("builds the layout from the spec", () => {
    expect(firestorePaths.user("u1")).toBe("users/u1");
    expect(firestorePaths.month("u1", "2026-09")).toBe("users/u1/months/2026-09");
    expect(firestorePaths.analysis("u1", "g1", "2026-09")).toBe(
      "users/u1/goals/g1/analyses/2026-09",
    );
    expect(firestorePaths.override("u1", "dti_cap")).toBe("users/u1/overrides/dti_cap");
    expect(firestorePaths.rule("dti_cap")).toBe("rules/dti_cap");
  });

  it("recognises YYYY-MM month keys", () => {
    expect(isMonthKey("2026-09")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-9")).toBe(false);
    expect(isMonthKey("09-2026")).toBe(false);
  });
});
