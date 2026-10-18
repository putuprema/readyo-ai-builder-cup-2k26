import { describe, expect, it } from "vitest";
import type { Goal, Snapshot } from "../types.js";
import { loadProfile, loadTestRules } from "./fixtures.test-helper.js";
import { discretionaryAfterCaps, goalDateOf, simulate, targetTodayOf } from "./simulate.js";

const rules = loadTestRules();

const run = (name: Parameters<typeof loadProfile>[0], extra: Partial<Snapshot> = {}) => {
  const f = loadProfile(name);
  return simulate({
    snapshot: { ...f.snapshot, ...extra },
    profile: f.profile,
    goal: f.goal,
    rules,
    changes: [],
  });
};

describe("simulate: the month loop", () => {
  it("month 0 is the snapshot as given", () => {
    const { cash } = run("house-a");
    expect(cash.timeline[0]).toMatchObject({
      month: 0,
      liquid: 4_000_000,
      volatile: 15_000_000,
      debtPayments: 2_100_000,
      target: 800_000_000,
      emergencyMonths: 0.5,
      failing: ["emergency_months_required"],
    });
  });

  it("adds the surplus and the money-market return every month", () => {
    const { cash } = run("house-a");
    // (4,000,000 + 2,400,000) × (1 + 0.045 / 12)
    expect(cash.timeline[1]?.liquid).toBe(6_424_000);
    expect(cash.timeline[1]?.target).toBe(Math.round(800_000_000 * 1.06 ** (1 / 12)));
  });

  it("runs from month 0 to maxMonths inclusive", () => {
    const f = loadProfile("house-a");
    const r = simulate({ ...f, rules, changes: [], maxMonths: 24 });
    expect(r.cash.timeline).toHaveLength(25);
    expect(r.cash.timeline.at(-1)?.month).toBe(24);
    expect(simulate({ ...f, rules, changes: [] }).cash.timeline).toHaveLength(361);
  });

  it("drops a loan's installment the month after its tenor ends", () => {
    const { cash } = run("house-a");
    // Eight payments: months 0 to 7.
    expect(cash.timeline[7]?.debtPayments).toBe(2_100_000);
    expect(cash.timeline[8]?.debtPayments).toBe(0);
    // The surplus grows by the installment from then on.
    const d7 = (cash.timeline[8]?.liquid ?? 0) - (cash.timeline[7]?.liquid ?? 0);
    const d8 = (cash.timeline[9]?.liquid ?? 0) - (cash.timeline[8]?.liquid ?? 0);
    expect(d8 - d7).toBeGreaterThan(2_100_000 - 50_000);
    expect(d8 - d7).toBeLessThan(2_100_000 + 50_000);
  });

  it("volatile assets never grow and never count toward the emergency fund", () => {
    const { cash } = run("house-a");
    for (const s of cash.timeline) expect(s.volatile).toBe(15_000_000);
    expect(cash.timeline[0]?.emergencyMonths).toBe(0.5);
  });

  it("is ready on the cash path when liquid minus the reserve covers the target", () => {
    // Wedding-C: target 100 m today (200 m less 60 m partner and 40 m family), 25 m liquid,
    // 3.3 m surplus, goal 21 months away so volatile assets do not count.
    const { cash } = run("wedding-c");
    const m = cash.monthsToReady;
    expect(m).not.toBeNull();
    if (m === null) return;
    const ready = cash.timeline[m];
    const before = cash.timeline[m - 1];
    expect(ready && ready.liquid - 3 * 5_000_000 >= ready.target).toBe(true);
    expect(before && before.liquid - 3 * 5_000_000 >= before.target).toBe(false);
  });

  it("counts volatile assets toward a cash target only for goals 36 or more months away", () => {
    // House-A's goal is December 2030, 51 months from September 2026.
    const far = run("house-a", { liquidAssets: 24_000_000 + 800_000_000 - 15_000_000 });
    expect(far.cash.monthsToReady).toBe(0);
    const f = loadProfile("house-a");
    const near: Goal = {
      ...f.goal,
      inputs: { ...f.goal.inputs, targetYear: 2027 } as Goal["inputs"],
    };
    const r = simulate({
      snapshot: { ...f.snapshot, liquidAssets: 24_000_000 + 800_000_000 - 15_000_000 },
      profile: f.profile,
      goal: near,
      rules,
      changes: [],
    });
    expect(r.cash.monthsToReady).not.toBe(0);
  });

  it("returns null, not a large number, when never ready within maxMonths", () => {
    const f = loadProfile("house-a");
    const r = simulate({ ...f, rules, changes: [], maxMonths: 12 });
    expect(r.cash.monthsToReady).toBeNull();
  });

  it("uses the user's own price when set", () => {
    const f = loadProfile("house-a");
    const goal: Goal = {
      ...f.goal,
      estimate: f.goal.estimate && { ...f.goal.estimate, userOverride: 600_000_000 },
    };
    const r = simulate({ snapshot: f.snapshot, profile: f.profile, goal, rules, changes: [] });
    expect(r.cash.timeline[0]?.target).toBe(600_000_000);
  });

  it("applies the six-month emergency rule to freelancers", () => {
    const r = run("freelancer-d");
    const check = r.rulesChecked.find((c) => c.rule === "emergency_months_required");
    expect(check?.valueUsed).toBe(6);
  });

  it("throws when a rule it needs is missing", () => {
    const f = loadProfile("car-b");
    const { growth_car: _dropped, ...withoutCarGrowth } = rules;
    expect(() => simulate({ ...f, rules: withoutCarGrowth, changes: [] })).toThrow(/growth_car/);
  });
});

describe("goal helpers", () => {
  it("targetTodayOf subtracts the partner's and family's shares for a wedding", () => {
    expect(targetTodayOf(loadProfile("wedding-c").goal)).toBe(100_000_000);
    expect(targetTodayOf(loadProfile("car-b").goal)).toBe(280_000_000);
  });

  it("goalDateOf is the wedding month or December of the target year", () => {
    expect(goalDateOf(loadProfile("wedding-c").goal)).toBe("2028-06");
    expect(goalDateOf(loadProfile("house-a").goal)).toBe("2030-12");
  });

  it("discretionaryAfterCaps trims only the capped categories", () => {
    const s = loadProfile("house-a").snapshot;
    expect(discretionaryAfterCaps(s, {})).toBe(5_000_000);
    expect(discretionaryAfterCaps(s, { food_delivery: 600_000 })).toBe(4_200_000);
    expect(discretionaryAfterCaps(s, { food_delivery: 2_000_000 })).toBe(5_000_000);
    expect(discretionaryAfterCaps(s, { unknown: 0 })).toBe(5_000_000);
  });
});
