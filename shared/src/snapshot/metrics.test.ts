import { describe, expect, it } from "vitest";
import { type FixtureName, loadProfile, loadTestRules } from "../simulate/fixtures.test-helper.js";
import { simulate } from "../simulate/simulate.js";
import type { Goal, Metric, Snapshot } from "../types.js";
import { computeMetrics, METRIC_IDS, months, pct } from "./metrics.js";

const rules = loadTestRules();

function metricsFor(
  name: FixtureName,
  snapshotExtra: Partial<Snapshot> = {},
  goalExtra: Partial<Goal> = {},
  ruleExtra: Record<string, number> = {},
): Metric[] {
  const f = loadProfile(name);
  const snapshot = { ...f.snapshot, ...snapshotExtra };
  const goal = { ...f.goal, ...goalExtra };
  const merged = { ...rules, ...ruleExtra };
  const simulation = simulate({ snapshot, profile: f.profile, goal, rules: merged, changes: [] });
  return computeMetrics({ snapshot, profile: f.profile, goal, rules: merged, simulation });
}

const byId = (metrics: Metric[], id: string): Metric => {
  const m = metrics.find((x) => x.id === id);
  if (!m) throw new Error(`metric ${id} missing`);
  return m;
};

describe("computeMetrics: House-A (spec acceptance criteria)", () => {
  const metrics = metricsFor("house-a");

  it("returns the seven metrics in display order", () => {
    expect(metrics.map((m) => m.id)).toEqual([...METRIC_IDS]);
    expect(metrics).toHaveLength(7);
  });

  it("dti ≈ 0.38 blocks", () => {
    const dti = byId(metrics, "dti");
    expect(dti.you).toBeCloseTo(0.382, 3);
    expect(dti.rule).toBe(0.35);
    expect(dti.status).toBe("blocks");
    expect(dti.meaning).toBe(
      "PayLater Rp 2.1 m/mo plus the KPR installment of Rp 4.8 m would take 38% of your income; banks cap it at 35%.",
    );
  });

  it("emergency_fund 0.5 blocks", () => {
    const m = byId(metrics, "emergency_fund");
    expect(m.you).toBe(0.5);
    expect(m.rule).toBe(3);
    expect(m.status).toBe("blocks");
    expect(m.meaning).toBe(
      "Liquid savings of Rp 4 m cover 0.5 months of essential spending; we require 3 months before applying.",
    );
  });

  it("expensive_debt Rp 12.4 m needs work", () => {
    const m = byId(metrics, "expensive_debt");
    expect(m.you).toBe(12_400_000);
    expect(m.rule).toBe(0);
    expect(m.status).toBe("needs_work");
    expect(m.meaning).toBe(
      "Rp 12.4 m outstanding at 31% a year (PayLater). Banks want debt above 24% a year cleared before a KPR.",
    );
  });

  it("savings_rate ≈ 0.13 needs work", () => {
    const m = byId(metrics, "savings_rate");
    expect(m.you).toBeCloseTo(0.1333, 4);
    expect(m.rule).toBe(0.2);
    expect(m.status).toBe("needs_work");
    expect(m.meaning).toBe(
      "You keep Rp 2.4 m of Rp 18 m (13%) after spending and debt payments; 20% is the target, under 10% blocks.",
    );
  });

  it("net_income passes with the confirmed income", () => {
    const m = byId(metrics, "net_income");
    expect(m).toMatchObject({ you: 18_000_000, status: "passes" });
    expect(m.rule).toBeUndefined();
    expect(m.meaning).toBe("Rp 18 m a month, own-account transfers excluded.");
  });

  it("goal_progress: nothing earmarked once the emergency fund comes first", () => {
    const m = byId(metrics, "goal_progress");
    expect(m).toMatchObject({
      label: "Down payment progress",
      you: 0,
      rule: 1,
      status: "needs_work",
    });
    expect(m.meaning).toBe(
      "Rp 4 m liquid, but the 3 months emergency fund (Rp 24 m) comes first, so nothing is earmarked yet for the Rp 160 m down payment (20% of the price today).",
    );
  });

  it("horizon_risk passes while the goal is three years or more away", () => {
    // 2026-09 → 2030-12 is 51 months.
    const m = byId(metrics, "horizon_risk");
    expect(m.you).toBeCloseTo(15 / 19, 4);
    expect(m.rule).toBe(0.2);
    expect(m.status).toBe("passes");
    expect(m.meaning).toMatch(
      /^The goal is 51 months away, so volatile assets \(79% of savings\) still count/,
    );
  });

  it("every metric has a label, a numeric value and a sentence", () => {
    for (const m of metrics) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(Number.isFinite(m.you)).toBe(true);
      expect(m.meaning).toMatch(/\.$/);
    }
  });
});

describe("computeMetrics: statuses follow the rules table", () => {
  it("dti passes when the cap is raised above the figure", () => {
    const dti = byId(metricsFor("house-a", {}, {}, { dti_cap: 0.4 }), "dti");
    expect(dti.status).toBe("passes");
    expect(dti.rule).toBe(0.4);
    expect(dti.meaning).toMatch(/banks cap it at 40%, so this passes\.$/);
  });

  it("expensive debt follows expensive_debt_rate", () => {
    const m = byId(metricsFor("house-a", {}, {}, { expensive_debt_rate: 0.35 }), "expensive_debt");
    expect(m).toMatchObject({ you: 0, status: "passes", meaning: "No debt above 35% a year." });
  });

  it("savings rate: passes at the good band, blocks under the minimum", () => {
    const good = byId(metricsFor("house-a", { discretionarySpending: 3_000_000 }), "savings_rate");
    expect(good.you).toBeCloseTo(4.4 / 18, 4);
    expect(good.status).toBe("passes");

    const low = byId(metricsFor("house-a", { discretionarySpending: 6_000_000 }), "savings_rate");
    expect(low.you).toBeCloseTo(1.4 / 18, 4);
    expect(low.status).toBe("blocks");

    const negative = byId(
      metricsFor("house-a", { discretionarySpending: 9_000_000 }),
      "savings_rate",
    );
    expect(negative.you).toBeLessThan(0);
    expect(negative.status).toBe("blocks");
    expect(negative.meaning).toMatch(/^You spend Rp 1.6 m more than you earn each month/);
  });

  it("emergency fund uses the freelance rule for freelancers", () => {
    const f = loadProfile("freelancer-d");
    const m = byId(metricsFor("freelancer-d"), "emergency_fund");
    expect(m.rule).toBe(6);
    expect(m.you).toBeCloseTo(f.snapshot.liquidAssets / f.snapshot.essentialSpending, 2);
  });

  it("goal progress passes once the earmarked liquid covers the down payment", () => {
    const m = byId(metricsFor("house-a", { liquidAssets: 200_000_000 }), "goal_progress");
    expect(m.you).toBeCloseTo(176 / 160, 4);
    expect(m.status).toBe("passes");
    expect(m.meaning).toBe(
      "Rp 176 m earmarked after the 3 months emergency fund covers the Rp 160 m down payment (20% of the price today).",
    );
  });

  it("goal progress shows the part saved when some is earmarked", () => {
    const m = byId(metricsFor("house-a", { liquidAssets: 40_000_000 }), "goal_progress");
    expect(m.you).toBe(0.1);
    expect(m.meaning).toBe(
      "Rp 16 m saved of the Rp 160 m down payment (20% of the price today), after setting aside 3 months of essentials.",
    );
  });

  it("horizon risk needs work when a near goal has too much in volatile assets", () => {
    const near = metricsFor(
      "house-a",
      {},
      { inputs: { ...loadProfile("house-a").goal.inputs, targetYear: 2028 } },
    );
    const m = byId(near, "horizon_risk");
    expect(m.status).toBe("needs_work");
    expect(m.meaning).toBe(
      "79% of your savings are in volatile assets (Rp 15 m) with the goal under three years away; they count at zero until moved to something stable.",
    );
    const calm = byId(
      metricsFor(
        "house-a",
        { volatileAssets: 500_000 },
        { inputs: { ...loadProfile("house-a").goal.inputs, targetYear: 2028 } },
      ),
      "horizon_risk",
    );
    expect(calm.status).toBe("passes");
    expect(calm.meaning).toMatch(/within the 20% limit\.$/);
  });

  it("net income explains a confirmed figure that differs from the statements", () => {
    const m = byId(metricsFor("house-a", { computedNetIncome: 18_500_000 }), "net_income");
    expect(m.meaning).toBe(
      "Rp 18 m a month as you confirmed; your statements show Rp 18.5 m, own-account transfers excluded.",
    );
    const carried = byId(
      metricsFor("house-a", { estimatedSources: ["bank", "ewallet"] }),
      "net_income",
    );
    expect(carried.meaning).toMatch(/last month's figures were carried\.$/);
  });
});

describe("computeMetrics: goals without a loan path", () => {
  it("wedding: dti and expensive debt are shown, dti never blocks", () => {
    const f = loadProfile("wedding-c");
    const withDebt = metricsFor("wedding-c", {
      loans: loadProfile("house-a").snapshot.loans,
      debtPayments: Math.round(f.snapshot.netIncome * 0.4),
    });
    const dti = byId(withDebt, "dti");
    expect(dti.you).toBeCloseTo(0.4, 4);
    expect(dti.status).toBe("needs_work");
    expect(dti.meaning).toMatch(/No loan is involved, but every installment slows your saving\.$/);
    expect(byId(withDebt, "expensive_debt").status).toBe("needs_work");

    const noDebt = byId(metricsFor("wedding-c", { loans: [], debtPayments: 0 }), "dti");
    expect(noDebt).toMatchObject({ you: 0, status: "passes" });
    expect(noDebt.meaning).toBe("No debt payments this month. No loan is involved in this goal.");
  });

  it("wedding: goal progress is against the savings target (the user's share)", () => {
    const f = loadProfile("wedding-c");
    const metrics = metricsFor("wedding-c");
    const m = byId(metrics, "goal_progress");
    const sim = simulate({ ...f, rules, changes: [] });
    const target = sim.cash.timeline[0]?.target ?? 0;
    const required = f.profile.employment === "freelance" ? 6 : 3;
    const earmarked = Math.max(
      0,
      f.snapshot.liquidAssets - required * f.snapshot.essentialSpending,
    );
    expect(m.label).toBe("Savings progress");
    expect(m.you).toBeCloseTo(earmarked / target, 4);
    expect(m.meaning).toMatch(/wedding savings target \(your share\)/);
  });

  it("house with a cash preference measures progress against the full price", () => {
    const m = byId(
      metricsFor("house-a", { liquidAssets: 100_000_000 }, { payPreference: "cash" }),
      "goal_progress",
    );
    expect(m.label).toBe("Savings progress");
    expect(m.you).toBeCloseTo(76 / 800, 4);
    expect(m.meaning).toMatch(/of the Rp 800 m price today/);
  });

  it("the metrics are the same on a repeat call", () => {
    expect(metricsFor("car-b")).toEqual(metricsFor("car-b"));
    expect(byId(metricsFor("car-b"), "dti").meaning).toMatch(/KKB installment/);
  });
});

describe("formatting helpers", () => {
  it("pct and months", () => {
    expect(pct(0.382)).toBe("38%");
    expect(pct(0.1333)).toBe("13%");
    expect(months(0.5)).toBe("0.5 months");
    expect(months(1)).toBe("1 month");
    expect(months(4.63)).toBe("4.6 months");
    expect(months(3)).toBe("3 months");
  });
});
