import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RULE_IDS } from "../rules.js";
import { simulate } from "../simulate/simulate.js";
import type { RuleValue } from "../types.js";
import {
  DEMO_MONTH,
  DEMO_RULE_PLACEHOLDERS,
  DEMO_UID,
  demoActions,
  demoAnalysis,
  demoDocuments,
  demoGoal,
  demoHoldings,
  demoLoans,
  demoMetrics,
  demoProfile,
  demoRuleDefaults,
  demoRules,
  demoSeedDocuments,
  demoSnapshot,
  demoTransactions,
  demoWithoutPlan,
  demoWithPlan,
} from "./index.js";

// The demo data is sample data, but it must agree with itself: the UI built on it should
// not show a snapshot that contradicts its own metrics or analysis, and the analysis must be
// what simulate() produces over that snapshot.

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

describe("demo rules", () => {
  it("are shared/rules/defaults.json plus the declared placeholders, nothing else", () => {
    const file = JSON.parse(
      readFileSync(new URL("../../rules/defaults.json", import.meta.url), "utf8"),
    ) as RuleValue[];
    expect(demoRuleDefaults).toEqual(file);
    const expected: Record<string, number> = { ...DEMO_RULE_PLACEHOLDERS };
    for (const r of file) expected[r.id] = r.value;
    expect(demoRules).toEqual(expected);
  });

  it("placeholders fill only [__] rules that the defaults leave out", () => {
    const defaultIds = new Set(demoRuleDefaults.map((r) => r.id));
    for (const id of Object.keys(DEMO_RULE_PLACEHOLDERS)) {
      expect(RULE_IDS).toContain(id);
      expect(defaultIds.has(id)).toBe(false);
    }
  });
});

describe("demo analysis", () => {
  const input = { snapshot: demoSnapshot, profile: demoProfile, goal: demoGoal, rules: demoRules };

  it("belongs to the active goal and its latest month", () => {
    expect(demoAnalysis.goalId).toBe(demoGoal.id);
    expect(demoAnalysis.month).toBe(DEMO_MONTH);
    expect(demoGoal.status).toBe("active");
    expect(demoGoal.latestAnalysisMonth).toBe(DEMO_MONTH);
  });

  it("both simulation results are simulate() over the demo data", () => {
    expect(demoAnalysis.withoutPlan).toBe(demoWithoutPlan);
    expect(demoAnalysis.withPlan).toBe(demoWithPlan);
    expect(demoWithoutPlan).toEqual(simulate({ ...input, changes: [] }));
    expect(demoWithPlan).toEqual(simulate({ ...input, changes: demoActions.map((a) => a.change) }));
    expect(demoAnalysis.rejectedOptions).toEqual(demoWithoutPlan.rejectedOptions);
  });

  it("reaches KPR approval on both paths, sooner with the plan", () => {
    const without = demoWithoutPlan.loan?.monthsToReady;
    const withPlan = demoWithPlan.loan?.monthsToReady;
    if (without == null || withPlan == null) throw new Error("the demo must reach approval");
    expect(without).toBeGreaterThan(0);
    expect(withPlan).toBeLessThan(without);
    expect(demoWithoutPlan.loan?.approvableToday).toBe(false);
    expect(demoWithPlan.cash.monthsToReady).toBeLessThan(
      demoWithoutPlan.cash.monthsToReady ?? Number.POSITIVE_INFINITY,
    );
  });

  it("the summary quotes the simulated months", () => {
    expect(demoAnalysis.summary).toContain(`${demoWithPlan.loan?.monthsToReady} months`);
    expect(demoAnalysis.summary).toContain(`${demoWithoutPlan.loan?.monthsToReady} months`);
  });

  it("timelines agree with monthsToReady and blockedBy", () => {
    for (const result of [demoWithoutPlan, demoWithPlan]) {
      const loan = result.loan;
      if (!loan) throw new Error("house goal has a loan path");
      const ready = loan.monthsToReady ?? Number.POSITIVE_INFINITY;
      const firstPassing = loan.timeline.find((s) => s.failing.length === 0)?.month;
      expect(firstPassing).toBe(ready);
      const first = loan.timeline[0];
      expect(first?.month).toBe(0);
      expect(first?.failing).toEqual(loan.blockedBy.map((b) => b.rule));
      const reserve = demoRules.emergency_months_required ?? 0;
      expect(loan.blockedBy.find((b) => b.rule.startsWith("min_dp"))?.value).toBe(
        (first?.liquid ?? 0) - reserve * demoSnapshot.essentialSpending,
      );
    }
  });

  it("actions are at most three, each with a verified change and a choice", () => {
    expect(demoActions.length).toBeLessThanOrEqual(3);
    expect(Object.keys(demoAnalysis.choices).sort()).toEqual(demoActions.map((a) => a.id).sort());
    const baseline = demoWithoutPlan.loan?.monthsToReady ?? Number.POSITIVE_INFINITY;
    for (const a of demoActions) {
      expect(a.chips.length).toBeGreaterThan(0);
      // monthsSaved is the action on its own against doing nothing.
      const alone = simulate({ ...input, changes: [a.change] }).loan?.monthsToReady;
      expect(a.monthsSaved).toBe(baseline - (alone ?? Number.POSITIVE_INFINITY));
      expect(a.monthsSaved).toBeGreaterThan(0);
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

  it("holds no undefined values, which Firestore rejects", () => {
    const visit = (v: unknown, path: string): void => {
      expect(v, path).not.toBeUndefined();
      if (Array.isArray(v)) {
        v.forEach((x, i) => {
          visit(x, `${path}[${i}]`);
        });
      } else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) visit(x, `${path}.${k}`);
      }
    };
    for (const d of demoSeedDocuments()) visit(d.data, d.path);
  });

  it("keeps the analysis document well under Firestore's 1 MiB limit", () => {
    const analysis = demoSeedDocuments().find((d) => d.path.includes("/analyses/"));
    expect(JSON.stringify(analysis?.data).length).toBeLessThan(512 * 1024);
  });
});
