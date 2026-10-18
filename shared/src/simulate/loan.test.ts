import { describe, expect, it } from "vitest";
import type { Goal, HouseInputs } from "../types.js";
import { loadProfile, loadTestRules } from "./fixtures.test-helper.js";
import { allowedTenorYears, checkLoanMonth, planLoan } from "./loan.js";
import { simulate } from "./simulate.js";

const rules = loadTestRules();

const run = (name: Parameters<typeof loadProfile>[0], goalPatch: Partial<Goal> = {}) => {
  const f = loadProfile(name);
  return simulate({
    snapshot: f.snapshot,
    profile: f.profile,
    goal: { ...f.goal, ...goalPatch },
    rules,
    changes: [],
  });
};

const blocked = (r: ReturnType<typeof simulate>, rule: string) =>
  r.loan?.blockedBy.find((b) => b.rule === rule);

describe("planLoan", () => {
  it("picks the first-home DP rule, the KPR rate and a 20-year preference for House-A", () => {
    const f = loadProfile("house-a");
    const plan = planLoan(f.goal, f.profile, rules);
    expect(plan).toMatchObject({
      dpRuleId: "min_dp_first_home_new",
      dpRatio: 0.05,
      rateRuleId: "kpr_rate_fixed",
      annualRate: 0.065,
      preferredTenorYears: 20,
      loanEndAge: 55,
      dtiCap: 0.35,
      income: 18_000_000,
      jointApplication: false,
    });
  });

  it("uses the other-home DP rule and adds spouse income for a married joint applicant", () => {
    const f = loadProfile("freelancer-d");
    const plan = planLoan(f.goal, f.profile, rules);
    expect(plan?.dpRuleId).toBe("min_dp_other_home");
    expect(plan?.jointApplication).toBe(true);
    expect(plan?.income).toBe(32_000_000);
  });

  it("never adds spouse income for a single applicant asking for a joint loan", () => {
    const f = loadProfile("house-a");
    const inputs: HouseInputs = { ...(f.goal.inputs as HouseInputs), joint: "joint" };
    const plan = planLoan({ ...f.goal, inputs }, f.profile, rules);
    expect(plan?.jointApplication).toBe(false);
    expect(plan?.income).toBe(18_000_000);
  });

  it("plans a KKB for a car and nothing for a wedding", () => {
    const car = loadProfile("car-b");
    expect(planLoan(car.goal, car.profile, rules)).toMatchObject({
      dpRuleId: "min_dp_kkb",
      rateRuleId: "kkb_rate",
      tenorCapRuleId: "kkb_max_tenor_years",
      preferredTenorYears: rules.kkb_max_tenor_years,
    });
    const wedding = loadProfile("wedding-c");
    expect(planLoan(wedding.goal, wedding.profile, rules)).toBeUndefined();
  });
});

describe("allowedTenorYears and checkLoanMonth", () => {
  it("cuts the preferred tenor at loan_end_age", () => {
    const f = loadProfile("house-a");
    const plan = planLoan(f.goal, f.profile, rules);
    if (!plan) throw new Error("no plan");
    expect(allowedTenorYears(plan, 35)).toBe(20);
    expect(allowedTenorYears(plan, 40)).toBe(15);
    expect(allowedTenorYears({ ...plan, preferredTenorYears: 25 }, 35)).toBe(20);
    expect(allowedTenorYears(plan, 55)).toBe(0);
  });

  it("fails loan_end_age when no tenor of at least a year is left", () => {
    const f = loadProfile("house-a");
    const plan = planLoan(f.goal, f.profile, rules);
    if (!plan) throw new Error("no plan");
    const check = checkLoanMonth(plan, {
      target: 800_000_000,
      liquid: 1_000_000_000,
      reserve: 24_000_000,
      emergencyMonths: 100,
      emergencyRequired: 3,
      debtPayments: 0,
      age: 55,
    });
    expect(check.failing).toEqual(["loan_end_age"]);
    expect(check.installment).toBeUndefined();
  });
});

describe("the loan path", () => {
  it("House-A is not approvable today and is blocked by DTI, the emergency fund and the DP", () => {
    const r = run("house-a");
    expect(r.loan?.approvableToday).toBe(false);
    expect(r.loan?.blockedBy.map((b) => b.rule).sort()).toEqual(
      ["dti_cap", "emergency_months_required", "min_dp_first_home_new"].sort(),
    );
    const dti = blocked(r, "dti_cap");
    expect(dti?.value).toBeCloseTo(0.431, 3);
    expect(dti?.limit).toBe(0.35);
    const emergency = blocked(r, "emergency_months_required");
    expect(emergency?.value).toBe(0.5);
    expect(emergency?.limit).toBe(3);
    const dp = blocked(r, "min_dp_first_home_new");
    expect(dp?.limit).toBe(40_000_000);
    expect(dp?.value).toBe(0); // liquid is below the emergency reserve
  });

  it("House-A month 0 has the spec's installment, DP and DTI", () => {
    const r = run("house-a");
    const m0 = r.loan?.timeline[0];
    expect(m0?.dpNeeded).toBe(40_000_000);
    expect(m0?.dpPaid).toBe(40_000_000); // nothing earmarked: liquid is below the reserve
    expect(Math.abs((m0?.installment ?? 0) - 5_666_356)).toBeLessThanOrEqual(1); // on Rp 760 m
    expect(m0?.dti).toBeCloseTo(0.4315, 4);
    expect(m0?.failing).toEqual(["dti_cap", "min_dp_first_home_new", "emergency_months_required"]);
  });

  it("House-A as specified never reaches approval: DTI stays just above the cap", () => {
    // The emergency fund and the 5% DP are covered from about month 17, but by then the KPR
    // installment alone is 35% of income, and the tenor shrinks every year (the loan must end
    // by 55), so DTI hovers above the cap from month 17 on.
    const r = run("house-a");
    expect(r.loan?.monthsToReady).toBeNull();
    expect(r.loan?.installmentAtApproval).toBeUndefined();
    expect(r.loan?.timeline[40]?.failing).toContain("dti_cap");
    expect(r.loan?.timeline[60]?.failing).toEqual(["dti_cap"]);
  });

  it("House-A with Rp 60 m saved becomes approvable and reports the installment and tenor", () => {
    const f = loadProfile("house-a");
    const r = simulate({
      snapshot: { ...f.snapshot, liquidAssets: 60_000_000 },
      profile: f.profile,
      goal: f.goal,
      rules,
      changes: [],
    });
    const m = r.loan?.monthsToReady;
    expect(m).toBe(8); // the month after the PayLater's last payment
    if (m === null || m === undefined) return;
    expect(r.loan?.timeline[m]?.failing).toEqual([]);
    expect(r.loan?.timeline[m - 1]?.failing.length).toBeGreaterThan(0);
    expect(r.loan?.installmentAtApproval).toBe(r.loan?.timeline[m]?.installment);
    expect(r.loan?.tenorYears).toBe(Math.min(20, 55 - (35 + Math.floor(m / 12))));
    // The loan path and the cash path share the same months.
    expect(r.loan?.timeline).toHaveLength(r.cash.timeline.length);
  });

  it("DTI uses the applicant's income only, and clears when the PayLater ends", () => {
    const r = run("house-a");
    const dti = (m: number) => r.loan?.timeline[m]?.dti ?? 0;
    expect(dti(7)).toBeGreaterThan(0.35);
    expect(dti(8)).toBeLessThan(0.35); // 5.89 m / 18 m = 0.327
    expect(r.loan?.timeline[8]?.failing).not.toContain("dti_cap");
  });

  it("a wedding has no loan field", () => {
    const r = run("wedding-c");
    expect("loan" in r).toBe(false);
    expect(r.rulesChecked.map((c) => c.rule)).not.toContain("dti_cap");
  });

  it("a car loan uses the KKB rules and is capped at kkb_max_tenor_years", () => {
    const r = run("car-b");
    const m0 = r.loan?.timeline[0];
    expect(m0?.dpNeeded).toBe(Math.round(220_000_000 * rules.min_dp_kkb));
    expect(r.loan?.monthsToReady).not.toBeNull();
    expect(r.loan?.tenorYears).toBe(rules.kkb_max_tenor_years);
    expect(r.rulesChecked.find((c) => c.rule === "kkb_max_tenor_years")?.effect).toBe("passes");
    expect(r.rulesChecked.find((c) => c.rule === "kkb_rate")?.valueUsed).toBe(rules.kkb_rate);
  });

  it("the freelancer needs six months of emergency fund before applying", () => {
    const r = run("freelancer-d");
    // 60 m liquid over 9 m essential = 6.67 months: passes the six-month rule.
    expect(r.loan?.timeline[0]?.failing).not.toContain("emergency_months_required");
    const f = loadProfile("freelancer-d");
    const thin = simulate({
      snapshot: { ...f.snapshot, liquidAssets: 40_000_000 },
      profile: f.profile,
      goal: f.goal,
      rules,
      changes: [],
    });
    expect(blocked(thin, "emergency_months_required")).toMatchObject({ limit: 6 });
  });

  it("rulesChecked lists the lending rules with the value used and the person's own number", () => {
    const r = run("house-a");
    const byRule = Object.fromEntries(r.rulesChecked.map((c) => [c.rule, c]));
    expect(byRule.dti_cap).toMatchObject({ valueUsed: 0.35, effect: "blocks" });
    expect(byRule.dti_cap?.you).toBeCloseTo(0.4315, 4);
    expect(byRule.min_dp_first_home_new).toMatchObject({
      valueUsed: 0.05,
      you: 40_000_000,
      effect: "blocks",
    });
    expect(byRule.emergency_months_required).toMatchObject({
      valueUsed: 3,
      you: 0.5,
      effect: "blocks",
    });
    expect(byRule.loan_end_age).toMatchObject({ valueUsed: 55, you: 20, effect: "passes" });
    expect(byRule.kpr_rate_fixed).toMatchObject({ valueUsed: 0.065, effect: "sets_target" });
    expect(byRule.growth_property).toMatchObject({ valueUsed: 0.06, effect: "sets_target" });
  });

  it("loan_end_age cuts the default 20-year tenor for an older applicant", () => {
    const f = loadProfile("house-a");
    const r = simulate({
      snapshot: f.snapshot,
      profile: { ...f.profile, age: 45 },
      goal: f.goal,
      rules,
      changes: [],
    });
    expect(r.rulesChecked.find((c) => c.rule === "loan_end_age")).toMatchObject({
      you: 10,
      effect: "rejects_option",
    });
    expect(r.loan?.tenorYears === undefined || r.loan.tenorYears <= 10).toBe(true);
  });
});
