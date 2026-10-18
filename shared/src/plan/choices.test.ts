import { describe, expect, it } from "vitest";
import {
  demoActions,
  demoGoal,
  demoProfile,
  demoRules,
  demoSnapshot,
  demoWithoutPlan,
  demoWithPlan,
} from "../demo/index.js";
import { simulate } from "../simulate/simulate.js";
import {
  dismissedActionsFrom,
  mergeDismissedActions,
  planWithChoices,
  toDismissedAction,
} from "./choices.js";

// specs/06-agent.md task 4, the pure part: the plan line recomputed from simulate() with the
// non-dismissed actions, and dismissed actions as preferences. The PATCH route wraps these.

const input = {
  snapshot: demoSnapshot,
  profile: demoProfile,
  goal: demoGoal,
  rules: demoRules,
  actions: demoActions,
};

describe("planWithChoices", () => {
  it("all undecided: the full plan", () => {
    const plan = planWithChoices({ ...input, choices: {} });
    expect(plan.result).toEqual(demoWithPlan);
    expect(plan.included).toEqual(["a1", "a2", "a3"]);
    expect(plan.skipped).toEqual([]);
    expect(plan.committed).toEqual([]);
  });

  it("one dismissed: simulate() with the other two", () => {
    const plan = planWithChoices({
      ...input,
      choices: { a1: "committed", a2: "dismissed", a3: "undecided" },
    });
    const expected = simulate({
      snapshot: demoSnapshot,
      profile: demoProfile,
      goal: demoGoal,
      rules: demoRules,
      changes: [demoActions[0]?.change, demoActions[2]?.change].filter(
        (c): c is NonNullable<typeof c> => c !== undefined,
      ),
    });
    expect(plan.result).toEqual(expected);
    expect(plan.included).toEqual(["a1", "a3"]);
    expect(plan.skipped).toEqual(["a2"]);
    expect(plan.committed).toEqual(["a1"]);
    const withAll = demoWithPlan.loan?.monthsToReady ?? 0;
    const withChoices = plan.result.loan?.monthsToReady ?? 0;
    expect(withChoices).toBeGreaterThanOrEqual(withAll);
    expect(withChoices).toBeLessThan(demoWithoutPlan.loan?.monthsToReady ?? 0);
  });

  it("all dismissed: back to doing nothing", () => {
    const plan = planWithChoices({
      ...input,
      choices: { a1: "dismissed", a2: "dismissed", a3: "dismissed" },
    });
    expect(plan.result).toEqual(demoWithoutPlan);
    expect(plan.included).toEqual([]);
  });

  it("undo (back to undecided) counts the action again", () => {
    const dismissed = planWithChoices({ ...input, choices: { a2: "dismissed" } });
    const undone = planWithChoices({ ...input, choices: { a2: "undecided" } });
    expect(undone.result).toEqual(demoWithPlan);
    expect(dismissed.result).not.toEqual(demoWithPlan);
  });
});

describe("dismissed actions as preferences", () => {
  it("keeps the type and the loan or category only", () => {
    expect(
      toDismissedAction({ type: "pay_off_loan", loanId: "loan-kredivo", fromMonth: 0 }),
    ).toEqual({ type: "pay_off_loan", loanId: "loan-kredivo" });
    expect(
      toDismissedAction({
        type: "refinance_loan",
        loanId: "l",
        newAnnualRate: 0.1,
        newTenorMonths: 12,
        fromMonth: 0,
      }),
    ).toEqual({ type: "refinance_loan", loanId: "l" });
    expect(
      toDismissedAction({
        type: "cap_spending",
        category: "shopping",
        monthlyCap: 1,
        fromMonth: 1,
      }),
    ).toEqual({ type: "cap_spending", category: "shopping" });
    expect(toDismissedAction({ type: "move_assets", amount: 1, fromMonth: 0 })).toEqual({
      type: "move_assets",
    });
  });

  it("lists the dismissed actions of an analysis", () => {
    expect(dismissedActionsFrom(demoActions, { a2: "dismissed", a3: "committed" })).toEqual([
      { type: "pay_off_loan", loanId: "loan-kredivo" },
    ]);
    expect(dismissedActionsFrom(demoActions, {})).toEqual([]);
  });

  it("merges without duplicates", () => {
    const existing = [{ type: "move_assets" as const }];
    const merged = mergeDismissedActions(existing, [
      { type: "move_assets" },
      { type: "cap_spending", category: "shopping" },
      { type: "cap_spending", category: "shopping" },
    ]);
    expect(merged).toEqual([
      { type: "move_assets" },
      { type: "cap_spending", category: "shopping" },
    ]);
    expect(existing).toHaveLength(1);
  });
});
