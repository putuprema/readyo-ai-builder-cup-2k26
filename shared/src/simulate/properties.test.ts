import { describe, expect, it } from "vitest";
import type { Change, Snapshot } from "../types.js";
import { loadProfile, loadTestRules } from "./fixtures.test-helper.js";
import { type SimulateInput, simulate } from "./simulate.js";

// Property tests (specs/02-simulate.md, task 7): monotonicity per change type and per rule,
// and determinism. The grids are fixed, so the tests are deterministic too.

const rules = loadTestRules();

const houseA = (snapshot: Partial<Snapshot> = {}): SimulateInput => {
  const f = loadProfile("house-a");
  return {
    snapshot: { ...f.snapshot, ...snapshot },
    profile: f.profile,
    goal: f.goal,
    rules,
    changes: [],
    maxMonths: 120,
  };
};

// House-A as the spec defines it never reaches approval (see loan.test.ts); the variant with
// Rp 60 m saved does, so both the "never" and the "sooner" halves of each property are checked.
const profiles: [string, SimulateInput][] = [
  ["House-A", houseA()],
  ["House-A with Rp 60 m liquid", houseA({ liquidAssets: 60_000_000 })],
];

const loanMonths = (input: SimulateInput, changes: Change[] = [], extraRules = {}) =>
  simulate({
    ...input,
    changes: [...input.changes, ...changes],
    rules: { ...rules, ...extraRules },
  }).loan?.monthsToReady ?? null;

/** `after` is not later than `before`; null means never. */
const notLater = (before: number | null, after: number | null) =>
  before === null || (after !== null && after <= before);

/** `after` is not sooner than `before`; null means never. */
const notSooner = (before: number | null, after: number | null) =>
  after === null || (before !== null && after >= before);

// A refinance that stretches the debt past the PayLater's own end (8 payments) can delay
// approval under a DTI cap, so the property is stated for refinances that end no later.
const refinances: Change[] = [];
for (const rate of [0.1, 0.13, 0.2, 0.31]) {
  for (const tenor of [3, 6]) {
    for (const fromMonth of [0, 2]) {
      refinances.push({
        type: "refinance_loan",
        loanId: "paylater-1",
        newAnnualRate: rate,
        newTenorMonths: tenor,
        fromMonth,
      });
    }
  }
}

const payOffs: Change[] = [0, 3, 6].map((fromMonth) => ({
  type: "pay_off_loan",
  loanId: "paylater-1",
  fromMonth,
}));

const caps: Change[] = [];
for (const category of ["food_delivery", "shopping", "entertainment", "transport"]) {
  for (const monthlyCap of [0, 600_000, 1_000_000]) {
    for (const fromMonth of [0, 6, 12]) {
      caps.push({ type: "cap_spending", category, monthlyCap, fromMonth });
    }
  }
}

const moves: Change[] = [];
for (const amount of [1_000_000, 5_000_000, 15_000_000, 50_000_000]) {
  for (const fromMonth of [0, 6]) moves.push({ type: "move_assets", amount, fromMonth });
}

describe.each(profiles)("monotonicity for %s", (_name, input) => {
  const base = loanMonths(input);

  it.each([
    ["refinance_loan (ending no later than the PayLater)", refinances],
    ["pay_off_loan", payOffs],
    ["cap_spending", caps],
    ["move_assets", moves],
  ])("adding a %s never makes loan.monthsToReady larger", (_type, changes) => {
    for (const change of changes) {
      const after = loanMonths(input, [change]);
      expect(notLater(base, after), `${JSON.stringify(change)}: ${base} -> ${after}`).toBe(true);
    }
  });

  it("adding a change on top of a plan never makes loan.monthsToReady larger", () => {
    const plan: Change[] = [
      { type: "move_assets", amount: 15_000_000, fromMonth: 0 },
      { type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 },
    ];
    const withPlan = loanMonths(input, plan);
    expect(notLater(base, withPlan)).toBe(true);
    for (const change of [...caps, ...moves, ...payOffs]) {
      expect(notLater(withPlan, loanMonths(input, [...plan, change]))).toBe(true);
    }
  });

  it("raising dti_cap never makes loan.monthsToReady larger", () => {
    let previous = base;
    for (const dti_cap of [0.4, 0.45, 0.5, 0.6]) {
      const after = loanMonths(input, [], { dti_cap });
      expect(notLater(previous, after), `dti_cap ${dti_cap}: ${previous} -> ${after}`).toBe(true);
      previous = after;
    }
  });

  it("raising growth_property never makes loan.monthsToReady smaller", () => {
    let previous = base;
    for (const growth_property of [0.07, 0.08, 0.1, 0.15]) {
      const after = loanMonths(input, [], { growth_property });
      expect(notSooner(previous, after), `growth ${growth_property}: ${previous} -> ${after}`).toBe(
        true,
      );
      previous = after;
    }
  });

  it("the properties are not vacuous: the variant with savings is ready and moves", () => {
    if (base === null) return;
    // The PayLater's last payment binds this variant (approval in month 8), so faster price
    // growth cannot help and paying the PayLater off early moves the date.
    const slower = loanMonths(input, [], { growth_property: 0.08 });
    expect(slower === null || slower >= base).toBe(true);
    expect(
      loanMonths(input, [{ type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 }]),
    ).toBeLessThan(base);
  });
});

describe("determinism", () => {
  const plan: Change[] = [
    { type: "cap_spending", category: "food_delivery", monthlyCap: 600_000, fromMonth: 0 },
    { type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 },
    { type: "move_assets", amount: 10_000_000, fromMonth: 3 },
  ];

  it.each(["house-a", "car-b", "wedding-c", "freelancer-d"] as const)(
    "%s: calling twice with the same input returns deeply equal results",
    (name) => {
      const f = loadProfile(name);
      const input: SimulateInput = { ...f, rules, changes: plan };
      expect(simulate(input)).toEqual(simulate(input));
      expect(simulate(input)).toStrictEqual(simulate(structuredClone(input)));
    },
  );

  it("does not mutate its input", () => {
    const input = { ...houseA(), changes: plan };
    const before = JSON.stringify(input);
    simulate(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("the result survives a JSON round trip (no NaN, Infinity or undefined money)", () => {
    const r = simulate({ ...houseA(), changes: plan });
    const copy = JSON.parse(JSON.stringify(r));
    expect(copy.cash.monthsToReady).toBe(r.cash.monthsToReady);
    expect(copy.loan.monthsToReady).toBe(r.loan?.monthsToReady);
    for (const s of r.loan?.timeline ?? []) {
      for (const v of [s.liquid, s.volatile, s.debtPayments, s.target, s.dpNeeded]) {
        expect(Number.isInteger(v)).toBe(true);
      }
      expect(Number.isFinite(s.emergencyMonths)).toBe(true);
    }
  });
});
