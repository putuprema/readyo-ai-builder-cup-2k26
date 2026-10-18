import { describe, expect, it } from "vitest";
import type { Change } from "../types.js";
import { loadProfile, loadTestRules } from "./fixtures.test-helper.js";
import { annuity } from "./money.js";
import { simulate } from "./simulate.js";

const rules = loadTestRules();

const run = (name: Parameters<typeof loadProfile>[0], changes: Change[], maxMonths = 60) => {
  const f = loadProfile(name);
  return simulate({
    snapshot: f.snapshot,
    profile: f.profile,
    goal: f.goal,
    rules,
    changes,
    maxMonths,
  });
};

const MONTHLY_RETURN = 1 + 0.045 / 12;

describe("refinance_loan", () => {
  const refinance: Change = {
    type: "refinance_loan",
    loanId: "paylater-1",
    newAnnualRate: 0.13,
    newTenorMonths: 12,
    fromMonth: 0,
  };

  it("House-A refinanced to about Rp 1.1 m clears dti_cap in month 0", () => {
    const r = run("house-a", [refinance]);
    const m0 = r.loan?.timeline[0];
    expect(m0?.debtPayments).toBeCloseTo(1_107_500, -4);
    expect(Math.abs((m0?.dti ?? 0) - 0.326)).toBeLessThan(0.001);
    expect(m0?.failing).not.toContain("dti_cap");
    expect(m0?.failing).toEqual(["min_dp_first_home_new", "emergency_months_required"]);
    expect(r.loan?.approvableToday).toBe(false);
    expect(r.loan?.blockedBy.map((b) => b.rule)).not.toContain("dti_cap");
  });

  it("keeps the new installment for the new tenor and then drops it", () => {
    const r = run("house-a", [refinance]);
    const installment = Math.round(annuity(12_400_000, 0.13, 12));
    for (let m = 0; m < 12; m++) expect(r.cash.timeline[m]?.debtPayments).toBe(installment);
    expect(r.cash.timeline[12]?.debtPayments).toBe(0);
  });

  it("starts at fromMonth on the balance outstanding then", () => {
    const base = run("house-a", []);
    const r = run("house-a", [{ ...refinance, fromMonth: 3 }]);
    for (let m = 0; m < 3; m++) expect(r.cash.timeline[m]).toEqual(base.cash.timeline[m]);
    // Three payments of 2.1 m at 31 percent leave about 6.9 m outstanding.
    const m3 = r.cash.timeline[3]?.debtPayments ?? 0;
    expect(m3).toBeLessThan(2_100_000);
    expect(m3).toBeGreaterThan(Math.round(annuity(6_500_000, 0.13, 12)));
    expect(m3).toBeLessThan(Math.round(annuity(7_500_000, 0.13, 12)));
    expect(r.cash.timeline[15]?.debtPayments).toBe(0);
  });

  it("is a no-op for an unknown or finished loan", () => {
    const base = run("house-a", []);
    expect(run("house-a", [{ ...refinance, loanId: "nope" }])).toEqual(base);
    expect(run("house-a", [{ ...refinance, fromMonth: 9 }])).toEqual(base);
  });
});

describe("pay_off_loan", () => {
  it("pays the outstanding from liquid when it is covered at fromMonth", () => {
    // Wedding-C: 25 m liquid, 7.5 m KTA.
    const base = run("wedding-c", []);
    const r = run("wedding-c", [{ type: "pay_off_loan", loanId: "kta-1", fromMonth: 0 }]);
    expect(r.cash.timeline[0]?.liquid).toBe(25_000_000 - 7_500_000);
    expect(r.cash.timeline[0]?.debtPayments).toBe(0);
    expect(base.cash.timeline[0]?.debtPayments).toBe(700_000);
    // The freed installment flows into savings from the next month.
    const m1 = r.cash.timeline[1]?.liquid ?? 0;
    expect(m1).toBe(Math.round((17_500_000 + 3_300_000 + 700_000) * MONTHLY_RETURN));
  });

  it("waits until liquid covers the balance when it does not at fromMonth", () => {
    // House-A: 4 m liquid against 12.4 m outstanding; the balance shrinks while savings grow.
    const base = run("house-a", []);
    const r = run("house-a", [{ type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 }]);
    const paid = r.cash.timeline.findIndex((s) => s.debtPayments === 0);
    expect(paid).toBeGreaterThan(0);
    expect(paid).toBeLessThan(8);
    for (let m = 0; m < paid; m++) expect(r.cash.timeline[m]).toEqual(base.cash.timeline[m]);
    expect(r.cash.timeline[paid]?.liquid).toBeGreaterThanOrEqual(0);
    expect(r.cash.timeline[paid]?.liquid).toBeLessThan(base.cash.timeline[paid]?.liquid ?? 0);
    // Paying early saves the remaining interest, so savings end up ahead.
    expect(r.cash.timeline[12]?.liquid).toBeGreaterThan(base.cash.timeline[12]?.liquid ?? 0);
  });

  it("is a no-op for an unknown loan", () => {
    const base = run("house-a", []);
    expect(run("house-a", [{ type: "pay_off_loan", loanId: "nope", fromMonth: 0 }])).toEqual(base);
  });
});

describe("cap_spending", () => {
  it("raises the surplus by the amount cut from the category", () => {
    const r = run("house-a", [
      { type: "cap_spending", category: "food_delivery", monthlyCap: 600_000, fromMonth: 0 },
    ]);
    expect(r.cash.timeline[1]?.liquid).toBe(Math.round((4_000_000 + 3_200_000) * MONTHLY_RETURN));
  });

  it("starts at fromMonth, keeps the lowest of two caps, and ignores unknown categories", () => {
    const base = run("house-a", []);
    const late = run("house-a", [
      { type: "cap_spending", category: "food_delivery", monthlyCap: 600_000, fromMonth: 2 },
    ]);
    expect(late.cash.timeline[2]).toEqual(base.cash.timeline[2]);
    expect(late.cash.timeline[3]?.liquid).toBeGreaterThan(base.cash.timeline[3]?.liquid ?? 0);

    const two = run("house-a", [
      { type: "cap_spending", category: "food_delivery", monthlyCap: 1_000_000, fromMonth: 0 },
      { type: "cap_spending", category: "food_delivery", monthlyCap: 600_000, fromMonth: 0 },
    ]);
    expect(two.cash.timeline[1]?.liquid).toBe(Math.round((4_000_000 + 3_200_000) * MONTHLY_RETURN));

    const unknown = run("house-a", [
      { type: "cap_spending", category: "gym", monthlyCap: 0, fromMonth: 0 },
    ]);
    expect(unknown).toEqual(base);
  });
});

describe("move_assets", () => {
  it("moves volatile assets into liquid savings at fromMonth", () => {
    const base = run("house-a", []);
    const r = run("house-a", [{ type: "move_assets", amount: 10_000_000, fromMonth: 2 }]);
    expect(r.cash.timeline[1]).toEqual(base.cash.timeline[1]);
    expect(r.cash.timeline[2]?.volatile).toBe(5_000_000);
    expect(r.cash.timeline[2]?.liquid).toBe((base.cash.timeline[2]?.liquid ?? 0) + 10_000_000);
    expect(r.cash.timeline[2]?.emergencyMonths).toBeGreaterThan(
      base.cash.timeline[2]?.emergencyMonths ?? 0,
    );
  });

  it("never moves more than there is", () => {
    const r = run("house-a", [{ type: "move_assets", amount: 50_000_000, fromMonth: 0 }]);
    expect(r.cash.timeline[0]?.volatile).toBe(0);
    expect(r.cash.timeline[0]?.liquid).toBe(19_000_000);
  });

  it("at month 0 counts toward the DP that blockedBy reports", () => {
    // blockedBy describes month 0 after the changes with fromMonth 0, like the timeline does.
    const r = run("house-a", [{ type: "move_assets", amount: 15_000_000, fromMonth: 0 }]);
    const dp = r.loan?.blockedBy.find((b) => b.rule === "min_dp_first_home_new");
    const reserve = 3 * 8_000_000;
    expect(r.loan?.timeline[0]?.liquid).toBe(19_000_000);
    expect(dp?.value).toBe(Math.max(0, 19_000_000 - reserve));
    const base = run("house-a", []);
    expect(base.loan?.blockedBy.find((b) => b.rule === "min_dp_first_home_new")?.value).toBe(0);
  });
});

describe("changes together", () => {
  it("House-A with the demo plan reaches approval while the bare profile does not", () => {
    const base = run("house-a", [], 360);
    const planned = run(
      "house-a",
      [
        { type: "move_assets", amount: 15_000_000, fromMonth: 0 },
        {
          type: "refinance_loan",
          loanId: "paylater-1",
          newAnnualRate: 0.13,
          newTenorMonths: 12,
          fromMonth: 0,
        },
        { type: "cap_spending", category: "food_delivery", monthlyCap: 600_000, fromMonth: 0 },
      ],
      360,
    );
    expect(base.loan?.monthsToReady).toBeNull();
    expect(planned.loan?.monthsToReady).not.toBeNull();
  });
});
