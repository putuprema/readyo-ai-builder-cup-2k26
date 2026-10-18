import { describe, expect, it } from "vitest";
import type { CarInputs, Goal, HouseInputs, Profile } from "../types.js";
import { loadProfile, loadTestRules } from "./fixtures.test-helper.js";
import { simulate } from "./simulate.js";

const rules = loadTestRules();

const runHouse = (inputs: Partial<HouseInputs> = {}, profile: Partial<Profile> = {}) => {
  const f = loadProfile("house-a");
  const goal: Goal = { ...f.goal, inputs: { ...(f.goal.inputs as HouseInputs), ...inputs } };
  return simulate({
    snapshot: f.snapshot,
    profile: { ...f.profile, ...profile },
    goal,
    rules,
    changes: [],
    maxMonths: 12,
  });
};

const option = (r: ReturnType<typeof simulate>, name: string) =>
  r.rejectedOptions.filter((o) => o.option === name);

describe("rejectedOptions", () => {
  it("rejects a joint application for a single applicant", () => {
    const r = runHouse({ joint: "joint" });
    expect(option(r, "joint_application")).toEqual([
      expect.objectContaining({ option: "joint_application", rule: "marital_status" }),
    ]);
    expect(option(r, "joint_application")[0]?.reason).toMatch(/single/);
    // Simulated as a single applicant: DTI over the applicant's income only.
    expect(r.loan?.timeline[0]?.dti).toBeCloseTo(0.3818, 4);
  });

  it("accepts a joint application for a married applicant with a spouse income", () => {
    const r = simulate({ ...loadProfile("freelancer-d"), rules, changes: [], maxMonths: 12 });
    expect(option(r, "joint_application")).toEqual([]);
  });

  it("rejects a 25-year tenor at age 35 under loan_end_age and uses 20 years", () => {
    const r = runHouse({ preferredTenorYears: 25 });
    expect(option(r, "tenor_25y")).toEqual([
      expect.objectContaining({ option: "tenor_25y", rule: "loan_end_age" }),
    ]);
    expect(option(r, "tenor_25y")[0]?.reason).toMatch(/20 years/);
    expect(r.rulesChecked.find((c) => c.rule === "loan_end_age")?.effect).toBe("rejects_option");
    // The installment is the 20-year one.
    expect(Math.abs((r.loan?.timeline[0]?.installment ?? 0) - 4_771_668)).toBeLessThanOrEqual(1);
  });

  it("does not reject the default 20-year tenor at age 35", () => {
    const r = runHouse();
    expect(r.rejectedOptions.filter((o) => o.rule === "loan_end_age")).toEqual([]);
    expect(r.rulesChecked.find((c) => c.rule === "loan_end_age")?.effect).toBe("passes");
  });

  it("rejects FLPP when income is above the ceiling or the home is not a first home", () => {
    // House-A earns 18 m, above the test ceiling.
    const above = runHouse();
    expect(option(above, "flpp")).toEqual([
      expect.objectContaining({ option: "flpp", rule: "flpp_income_ceiling" }),
    ]);
    expect(above.rulesChecked.find((c) => c.rule === "flpp_income_ceiling")).toMatchObject({
      valueUsed: rules.flpp_income_ceiling,
      you: 18_000_000,
      effect: "rejects_option",
    });

    const second = runHouse({ firstHome: false });
    expect(option(second, "flpp")).toEqual([
      expect.objectContaining({ option: "flpp", rule: "flpp_first_home_only" }),
    ]);

    const eligible = runHouse({}, { netMonthlyIncome: 7_000_000 });
    expect(option(eligible, "flpp")).toEqual([]);
    expect(eligible.rulesChecked.find((c) => c.rule === "flpp_income_ceiling")?.effect).toBe(
      "passes",
    );
  });

  it("rejects a car tenor beyond kkb_max_tenor_years", () => {
    const f = loadProfile("car-b");
    const inputs: CarInputs = { ...(f.goal.inputs as CarInputs), preferredTenorYears: 7 };
    const r = simulate({
      snapshot: f.snapshot,
      profile: f.profile,
      goal: { ...f.goal, inputs },
      rules,
      changes: [],
      maxMonths: 12,
    });
    expect(option(r, "tenor_7y")).toEqual([
      expect.objectContaining({ option: "tenor_7y", rule: "kkb_max_tenor_years" }),
    ]);
    expect(r.rulesChecked.find((c) => c.rule === "kkb_max_tenor_years")?.effect).toBe(
      "rejects_option",
    );
    expect(r.loan?.timeline[0]?.installment).toBe(
      simulate({ ...f, rules, changes: [], maxMonths: 12 }).loan?.timeline[0]?.installment,
    );
  });

  it("a wedding rejects nothing", () => {
    const r = simulate({ ...loadProfile("wedding-c"), rules, changes: [], maxMonths: 12 });
    expect(r.rejectedOptions).toEqual([]);
  });
});
