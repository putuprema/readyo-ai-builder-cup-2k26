import { describe, expect, it } from "vitest";
import {
  DEMO_MONTH,
  DEMO_UID,
  demoActions,
  demoAnalysis,
  demoDocuments,
  demoGoal,
  demoHoldings,
  demoLoans,
  demoMetrics,
  demoSeedDocuments,
  demoSnapshot,
  demoTransactions,
} from "./index.js";

// The demo data is sample data, but it must agree with itself: the UI built on it should
// not show a snapshot that contradicts its own metrics or analysis.

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("demo snapshot", () => {
  it("discretionary categories add up to discretionary spending", () => {
    expect(sum(Object.values(demoSnapshot.discretionaryByCategory))).toBe(
      demoSnapshot.discretionarySpending,
    );
  });

  it("debt payments equal the loans' installments", () => {
    expect(sum(demoLoans.map((l) => l.monthlyInstallment))).toBe(demoSnapshot.debtPayments);
    expect(demoSnapshot.loans).toEqual(demoLoans);
  });

  it("liquid and volatile assets equal the holdings", () => {
    const liquid = demoHoldings.filter((h) => !h.volatile && h.liquidityClass !== "locked");
    const volatile = demoHoldings.filter((h) => h.volatile);
    expect(sum(liquid.map((h) => h.currentValue))).toBe(demoSnapshot.liquidAssets);
    expect(sum(volatile.map((h) => h.currentValue))).toBe(demoSnapshot.volatileAssets);
  });

  it("every record points at a document of the same month", () => {
    const docIds = new Set(demoDocuments.map((d) => d.id));
    for (const r of [...demoTransactions, ...demoLoans, ...demoHoldings]) {
      expect(r.month).toBe(DEMO_MONTH);
      expect(docIds.has(r.sourceFileId)).toBe(true);
    }
  });

  it("masks account numbers in transactions", () => {
    for (const t of demoTransactions) expect(t.sourceAccount).toMatch(/\*{4}\d{4}$/);
  });
});

describe("demo metrics", () => {
  const metric = (id: string) => {
    const m = demoMetrics.find((x) => x.id === id);
    if (!m) throw new Error(`missing metric ${id}`);
    return m;
  };
  const s = demoSnapshot;

  it("has the seven readiness metrics", () => {
    expect(demoMetrics.map((m) => m.id)).toEqual([
      "net_income",
      "savings_rate",
      "emergency_fund",
      "dti",
      "expensive_debt",
      "goal_funding",
      "horizon_risk",
    ]);
  });

  it("follow the snapshot", () => {
    const surplus =
      s.netIncome -
      s.essentialSpending -
      s.discretionarySpending -
      s.cashWithdrawals -
      s.debtPayments;
    expect(metric("net_income").you).toBe(s.netIncome);
    expect(metric("savings_rate").you).toBeCloseTo(surplus / s.netIncome, 2);
    expect(metric("emergency_fund").you).toBeCloseTo(s.liquidAssets / s.essentialSpending, 1);
    expect(metric("expensive_debt").you).toBe(
      sum(demoLoans.filter((l) => l.effectiveAnnualRate > 0.24).map((l) => l.outstandingPrincipal)),
    );
    const dpNeeded = 0.2 * (demoGoal.estimate?.targetToday ?? 0);
    expect(metric("goal_funding").you).toBeCloseTo(s.liquidAssets / dpNeeded, 2);
    expect(metric("horizon_risk").you).toBeCloseTo(
      s.volatileAssets / (s.liquidAssets + s.volatileAssets),
      2,
    );
  });

  it("blocks exactly where the loan path is blocked today", () => {
    const blocking = demoMetrics.filter((m) => m.status === "blocks").map((m) => m.id);
    expect(blocking).toEqual(["dti", "expensive_debt"]);
    const blockedBy = demoAnalysis.withoutPlan.loan?.blockedBy.map((b) => b.rule);
    expect(blockedBy).toContain("dti_cap");
  });
});

describe("demo analysis", () => {
  it("belongs to the active goal and its latest month", () => {
    expect(demoAnalysis.goalId).toBe(demoGoal.id);
    expect(demoAnalysis.month).toBe(DEMO_MONTH);
    expect(demoGoal.status).toBe("active");
    expect(demoGoal.latestAnalysisMonth).toBe(DEMO_MONTH);
  });

  it("the plan brings approval sooner, from month 26 to month 14", () => {
    expect(demoAnalysis.withoutPlan.loan?.monthsToReady).toBe(26);
    expect(demoAnalysis.withPlan.loan?.monthsToReady).toBe(14);
    expect(demoAnalysis.withPlan.cash.monthsToReady).toBeLessThan(
      demoAnalysis.withoutPlan.cash.monthsToReady ?? Number.POSITIVE_INFINITY,
    );
  });

  it("timelines agree with monthsToReady", () => {
    for (const result of [demoAnalysis.withoutPlan, demoAnalysis.withPlan]) {
      const loan = result.loan;
      if (!loan) throw new Error("house goal has a loan path");
      const ready = loan.monthsToReady ?? Number.POSITIVE_INFINITY;
      for (const state of loan.timeline) {
        expect(state.failing.length === 0).toBe(state.month >= ready);
      }
      const first = loan.timeline[0];
      expect(first?.month).toBe(0);
      expect(first?.failing).toEqual(loan.blockedBy.map((b) => b.rule));
      expect(first?.liquid).toBe(loan.blockedBy.find((b) => b.rule.startsWith("min_dp"))?.value);
    }
  });

  it("actions are at most three, each with a verified change and a choice", () => {
    expect(demoActions.length).toBeLessThanOrEqual(3);
    expect(Object.keys(demoAnalysis.choices).sort()).toEqual(demoActions.map((a) => a.id).sort());
    for (const a of demoActions) {
      expect(a.monthsSaved).toBeGreaterThan(0);
      expect(a.chips.length).toBeGreaterThan(0);
      if (a.change.type === "refinance_loan" || a.change.type === "pay_off_loan") {
        expect(demoLoans.map((l) => l.id)).toContain(a.change.loanId);
      }
      if (a.change.type === "move_assets")
        expect(a.change.amount).toBe(demoSnapshot.volatileAssets);
      if (a.change.type === "cap_spending") {
        expect(demoSnapshot.discretionaryByCategory).toHaveProperty(a.change.category);
      }
    }
  });
});

describe("demoSeedDocuments", () => {
  it("writes everything under the demo user and nothing else", () => {
    const docs = demoSeedDocuments();
    expect(docs.length).toBeGreaterThan(10);
    for (const d of docs)
      expect(d.path.startsWith(`users/${DEMO_UID}/`) || d.path === `users/${DEMO_UID}`).toBe(true);
    const paths = docs.map((d) => d.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain(`users/${DEMO_UID}/goals/${demoGoal.id}/analyses/${DEMO_MONTH}`);
    expect(paths).toContain(`users/${DEMO_UID}/months/${DEMO_MONTH}`);
  });

  it("accepts another uid", () => {
    expect(demoSeedDocuments("u2")[0]?.path).toBe("users/u2");
  });
});
