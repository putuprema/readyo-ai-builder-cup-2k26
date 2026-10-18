import type { Analysis, Goal, Metric, Snapshot } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { FakeJsonModel } from "../agent/fakes.js";
import { loadProfile } from "../agent/profiles.test-helper.js";
import { ModelError } from "../gemini/client.js";
import {
  changedMetrics,
  checkCommittedActions,
  computeDelta,
  fallbackSummary,
  monthName,
  writeDeltaSummary,
} from "./delta.js";

// Stage 7 in isolation: which metrics count as moved, how each kind of committed action is
// checked against the new snapshot, the template sentences, and the summary's number check.

const houseA = loadProfile("house-a");
const goal: Goal = houseA.goal;

function metric(id: string, you: number, status: Metric["status"], label = id): Metric {
  return { id, label, you, status, meaning: "" };
}

const empty = {
  cash: { monthsToReady: null, timeline: [] },
  rulesChecked: [],
  rejectedOptions: [],
};

function analysis(partial: Partial<Analysis>): Analysis {
  return {
    goalId: goal.id,
    month: "2026-09",
    metrics: [],
    withoutPlan: empty,
    withPlan: empty,
    actions: [],
    choices: {},
    rejectedOptions: [],
    summary: "",
    ...partial,
  };
}

const before: Snapshot = houseA.snapshot; // PayLater Rp 12.4 m at Rp 2.1 m a month, volatile Rp 15 m
const payLater = before.loans[0] as Snapshot["loans"][number];

describe("changedMetrics", () => {
  it("lists metrics whose value or status moved, in the new order", () => {
    const old = analysis({
      metrics: [
        metric("net_income", 18_000_000, "passes"),
        metric("dti", 0.382, "blocks"),
        metric("savings_rate", 0.1333, "needs_work"),
        metric("emergency_fund", 0.5, "blocks"),
      ],
    });
    const now = analysis({
      metrics: [
        metric("net_income", 18_050_000, "passes"), // within tolerance
        metric("dti", 0.348, "passes"),
        metric("savings_rate", 0.1333, "needs_work"),
        metric("emergency_fund", 0.5, "needs_work"), // status only
      ],
    });
    expect(changedMetrics(old, now)).toEqual([
      {
        id: "dti",
        label: "dti",
        oldValue: 0.382,
        newValue: 0.348,
        oldStatus: "blocks",
        newStatus: "passes",
      },
      {
        id: "emergency_fund",
        label: "emergency_fund",
        oldValue: 0.5,
        newValue: 0.5,
        oldStatus: "blocks",
        newStatus: "needs_work",
      },
    ]);
  });
});

describe("checkCommittedActions", () => {
  const actions: Analysis["actions"] = [
    {
      id: "a1",
      title: "Pay the PayLater off",
      impactLine: "",
      description: "",
      chips: [],
      monthsSaved: 3,
      change: { type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 },
    },
    {
      id: "a2",
      title: "Refinance the PayLater",
      impactLine: "",
      description: "",
      chips: [],
      monthsSaved: 2,
      change: {
        type: "refinance_loan",
        loanId: "paylater-1",
        newAnnualRate: 0.13,
        newTenorMonths: 24,
        fromMonth: 0,
      },
    },
    {
      id: "a3",
      title: "Cap food delivery at Rp 500 k",
      impactLine: "",
      description: "",
      chips: [],
      monthsSaved: 1,
      change: {
        type: "cap_spending",
        category: "food_delivery",
        monthlyCap: 500_000,
        fromMonth: 1,
      },
    },
    {
      id: "a4",
      title: "Move Rp 15 m",
      impactLine: "",
      description: "",
      chips: [],
      monthsSaved: 2,
      change: { type: "move_assets", amount: 15_000_000, fromMonth: 0 },
    },
    {
      id: "a5",
      title: "Undecided one",
      impactLine: "",
      description: "",
      chips: [],
      monthsSaved: 1,
      change: { type: "move_assets", amount: 1, fromMonth: 0 },
    },
  ];
  const previous = {
    month: "2026-09",
    snapshot: before,
    analysis: analysis({
      actions,
      choices: {
        a1: "committed",
        a2: "committed",
        a3: "committed",
        a4: "committed",
        a5: "undecided",
      },
    }),
  };

  it("sees a paid-off loan, a lower installment, a cap kept and a move done", () => {
    const after: Snapshot = {
      ...before,
      month: "2026-10",
      loans: [],
      discretionaryByCategory: { ...before.discretionaryByCategory, food_delivery: 450_000 },
      volatileAssets: 1_000_000,
    };
    const checks = checkCommittedActions({
      goal,
      previous,
      current: { snapshot: after, analysis: analysis({}) },
    });
    expect(checks.map((c) => [c.actionId, c.kept])).toEqual([
      ["a1", true],
      ["a2", true],
      ["a3", true],
      ["a4", true],
    ]);
    expect(checks[0]?.evidence).toBe("PayLater balance gone");
    expect(checks[2]?.evidence).toBe("Food delivery Rp 450 k, within the Rp 500 k cap");
    expect(checks[3]?.evidence).toBe("Volatile assets Rp 15 m → Rp 1 m");
  });

  it("matches the loan by lender when the id changed, and reports what did not happen", () => {
    const after: Snapshot = {
      ...before,
      month: "2026-10",
      loans: [{ ...payLater, id: "loan_new", outstandingPrincipal: 10_500_000 }],
      discretionaryByCategory: { ...before.discretionaryByCategory, food_delivery: 1_400_000 },
      volatileAssets: 14_000_000,
    };
    const checks = checkCommittedActions({
      goal,
      previous,
      current: { snapshot: after, analysis: analysis({}) },
    });
    expect(checks.map((c) => c.kept)).toEqual([false, false, false, false]);
    expect(checks[0]?.evidence).toBe("PayLater still shows Rp 10.5 m outstanding");
    expect(checks[1]?.evidence).toBe("PayLater installment unchanged at Rp 2.1 m");
    expect(checks[2]?.evidence).toBe("Food delivery Rp 1.4 m, above the Rp 500 k cap");
    expect(checks[3]?.evidence).toBe("Volatile assets Rp 15 m → Rp 14 m, not moved");
  });

  it("counts a refinance kept when the installment fell", () => {
    const after: Snapshot = {
      ...before,
      loans: [{ ...payLater, id: "loan_new", monthlyInstallment: 1_100_000 }],
    };
    const checks = checkCommittedActions({
      goal,
      previous,
      current: { snapshot: after, analysis: analysis({}) },
    });
    expect(checks[1]).toMatchObject({
      kept: true,
      evidence: "PayLater installment Rp 2.1 m → Rp 1.1 m",
    });
  });
});

describe("computeDelta and the template", () => {
  const previous = {
    month: "2026-09",
    snapshot: before,
    analysis: analysis({
      metrics: [metric("dti", 0.382, "blocks", "Debt-to-income")],
      withoutPlan: {
        ...empty,
        loan: { monthsToReady: null, timeline: [], approvableToday: false, blockedBy: [] },
      },
    }),
  };
  const current = {
    snapshot: { ...before, month: "2026-10" },
    analysis: analysis({
      month: "2026-10",
      metrics: [metric("dti", 0.348, "passes", "Debt-to-income")],
      withoutPlan: {
        ...empty,
        loan: { monthsToReady: 17, timeline: [], approvableToday: false, blockedBy: [] },
      },
    }),
  };

  it("reads the leading path's months and builds two sentences from the numbers", () => {
    const result = computeDelta({ goal, previous, current });
    expect(result.delta.monthsToReady).toEqual({ leadingPath: "loan", old: null, new: 17 });
    expect(result.delta.previousMonth).toBe("2026-09");
    expect(result.facts).toMatchObject({
      previousMonth: "September 2026",
      month: "October 2026",
      readyBefore: "not within 30 years",
      readyNow: "17 months",
      metricsMoved: "1",
      metric1: "Debt-to-income: 38% → 35% (blocks → passes)",
    });
    expect(result.fallback).toBe(
      "One metric moved in October 2026: debt-to-income 38% → 35%. Readiness improved: not within 30 years before, 17 months now.",
    );
  });

  it("says when nothing moved", () => {
    const same = {
      ...current,
      analysis: {
        ...current.analysis,
        metrics: previous.analysis.metrics,
        withoutPlan: previous.analysis.withoutPlan,
      },
    };
    const result = computeDelta({ goal, previous, current: same });
    expect(result.fallback).toBe(
      "Your numbers for October 2026 are in line with September 2026. Readiness is unchanged at not within 30 years.",
    );
    expect(fallbackSummary(result.delta, { goal, previous, current: same })).toBe(result.fallback);
    expect(monthName("2027-01")).toBe("January 2027");
  });

  describe("writeDeltaSummary", () => {
    const facts = computeDelta({ goal, previous, current });

    it("accepts a summary whose numbers are all in the facts", async () => {
      const model = new FakeJsonModel([
        {
          summary:
            "Your debt-to-income fell from 38% to 35%. A KPR is 17 months away now, where it was not within 30 years before.",
        },
      ]);
      const result = await writeDeltaSummary(facts, model);
      expect(result.fromFallback).toBe(false);
      expect(result.summary).toMatch(/^Your debt-to-income fell/);
      expect(model.requests[0]).toMatchObject({ tier: "flash", thinking: "low" });
      expect(model.requests[0]?.prompt).toContain("metric1: Debt-to-income: 38% → 35%");
    });

    it("retries once with the offending numbers, then falls back to the template", async () => {
      const model = new FakeJsonModel([
        { summary: "Your DTI fell to 0.35 and you are 1.5 years from a KPR." },
        { summary: "You saved Rp 2,100,000 this month." },
      ]);
      const result = await writeDeltaSummary(facts, model);
      expect(result.fromFallback).toBe(true);
      expect(result.summary).toBe(facts.fallback);
      expect(result.attempts).toBe(2);
      expect(model.requests[1]?.prompt).toMatch(/0\.35.*1\.5/);
      expect(result.warnings).toHaveLength(2);
    });

    it("falls back when the model fails or answers nothing", async () => {
      const failing = new FakeJsonModel([new ModelError("api_error", "Gemini API error 500")]);
      expect((await writeDeltaSummary(facts, failing)).fromFallback).toBe(true);
      const silent = new FakeJsonModel([{ summary: "" }]);
      expect((await writeDeltaSummary(facts, silent)).fromFallback).toBe(true);
    });
  });
});
