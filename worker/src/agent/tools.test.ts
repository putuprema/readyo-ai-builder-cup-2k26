import { simulate } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { createAgentContext, isDismissed, leadingPathOf } from "./context.js";
import { loadProfile, loadTestRules } from "./profiles.test-helper.js";
import {
  agentFunctionDeclarations,
  checkCandidate,
  LIST_CATEGORIES_TOOL,
  LIST_LOANS_TOOL,
  listLoansTool,
  listSpendingCategoriesTool,
  SIMULATE_TOOL,
  simulateTool,
  viewOf,
} from "./tools.js";

// specs/06-agent.md task 1: the tool wrappers around simulate() and the snapshot views.

const rules = loadTestRules();
const houseA = loadProfile("house-a");
const weddingC = loadProfile("wedding-c");

function context(fixture = houseA, extra: Parameters<typeof createAgentContext>[0] | object = {}) {
  return createAgentContext({
    snapshot: fixture.snapshot,
    profile: fixture.profile,
    goal: fixture.goal,
    rules,
    ...extra,
  });
}

describe("agent context", () => {
  it("computes the no-change simulation and the leading path", () => {
    const ctx = context();
    expect(ctx.leadingPath).toBe("loan");
    expect(ctx.withoutPlan).toEqual(
      simulate({
        snapshot: houseA.snapshot,
        profile: houseA.profile,
        goal: houseA.goal,
        rules,
        changes: [],
      }),
    );
    expect(leadingPathOf(weddingC.goal)).toBe("cash");
    expect(leadingPathOf({ ...houseA.goal, payPreference: "cash" })).toBe("cash");
  });

  it("matches dismissed actions by type and target", () => {
    const dismissed = [
      { type: "pay_off_loan" as const, loanId: "paylater-1" },
      { type: "cap_spending" as const, category: "shopping" },
      { type: "move_assets" as const },
    ];
    expect(
      isDismissed(dismissed, { type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 }),
    ).toBe(true);
    expect(isDismissed(dismissed, { type: "pay_off_loan", loanId: "other", fromMonth: 0 })).toBe(
      false,
    );
    expect(
      isDismissed(dismissed, {
        type: "refinance_loan",
        loanId: "paylater-1",
        newAnnualRate: 0.1,
        newTenorMonths: 12,
        fromMonth: 0,
      }),
    ).toBe(false);
    expect(
      isDismissed(dismissed, {
        type: "cap_spending",
        category: "shopping",
        monthlyCap: 0,
        fromMonth: 1,
      }),
    ).toBe(true);
    expect(
      isDismissed(dismissed, {
        type: "cap_spending",
        category: "food_delivery",
        monthlyCap: 0,
        fromMonth: 1,
      }),
    ).toBe(false);
    expect(isDismissed(dismissed, { type: "move_assets", amount: 1, fromMonth: 0 })).toBe(true);
  });
});

describe("checkCandidate", () => {
  const ctx = context();

  it("builds each change type from flat arguments", () => {
    expect(
      checkCandidate(ctx, { type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 }),
    ).toEqual({
      ok: true,
      change: { type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 },
    });
    expect(
      checkCandidate(ctx, {
        type: "refinance_loan",
        loanId: "paylater-1",
        newAnnualRate: 0.13,
        newTenorMonths: 24,
        fromMonth: 0,
      }),
    ).toEqual({
      ok: true,
      change: {
        type: "refinance_loan",
        loanId: "paylater-1",
        newAnnualRate: 0.13,
        newTenorMonths: 24,
        fromMonth: 0,
      },
    });
    expect(
      checkCandidate(ctx, {
        type: "cap_spending",
        category: "food_delivery",
        monthlyCap: 500_000,
        fromMonth: 1,
      }),
    ).toEqual({
      ok: true,
      change: {
        type: "cap_spending",
        category: "food_delivery",
        monthlyCap: 500_000,
        fromMonth: 1,
      },
    });
    expect(checkCandidate(ctx, { type: "move_assets", amount: 15_000_000, fromMonth: 0 })).toEqual({
      ok: true,
      change: { type: "move_assets", amount: 15_000_000, fromMonth: 0 },
    });
  });

  it("rejects malformed and out-of-range arguments with a message, never a throw", () => {
    const cases: unknown[] = [
      { type: "sell_house", fromMonth: 0 },
      { type: "pay_off_loan", loanId: "paylater-1", fromMonth: 13 },
      { type: "pay_off_loan", loanId: "nope", fromMonth: 0 },
      {
        type: "refinance_loan",
        loanId: "paylater-1",
        newAnnualRate: 13,
        newTenorMonths: 24,
        fromMonth: 0,
      },
      {
        type: "refinance_loan",
        loanId: "paylater-1",
        newAnnualRate: 0.4,
        newTenorMonths: 24,
        fromMonth: 0,
      },
      {
        type: "refinance_loan",
        loanId: "paylater-1",
        newAnnualRate: 0.13,
        newTenorMonths: 0,
        fromMonth: 0,
      },
      { type: "cap_spending", category: "unknown", monthlyCap: 0, fromMonth: 0 },
      { type: "cap_spending", category: "food_delivery", monthlyCap: 1_400_000, fromMonth: 0 },
      { type: "move_assets", amount: 15_000_001, fromMonth: 0 },
      { type: "move_assets", amount: 0, fromMonth: 0 },
      "not even an object",
    ];
    for (const raw of cases) {
      const result = checkCandidate(ctx, raw);
      expect(result.ok, JSON.stringify(raw)).toBe(false);
      if (!result.ok) expect(result.error.length).toBeGreaterThan(10);
    }
  });

  it("refuses an action the user dismissed before", () => {
    const withDismissed = context(houseA, {
      dismissed: [{ type: "pay_off_loan", loanId: "paylater-1" }],
    });
    const result = checkCandidate(withDismissed, {
      type: "pay_off_loan",
      loanId: "paylater-1",
      fromMonth: 0,
    });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/dismissed/);
    // The same loan can still be refinanced: a different action type.
    expect(
      checkCandidate(withDismissed, {
        type: "refinance_loan",
        loanId: "paylater-1",
        newAnnualRate: 0.13,
        newTenorMonths: 12,
        fromMonth: 0,
      }).ok,
    ).toBe(true);
  });

  it("refuses loan actions for a wedding goal, which has no loan path", () => {
    const wedding = context(weddingC);
    const result = checkCandidate(wedding, { type: "pay_off_loan", loanId: "kta-1", fromMonth: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no loan path/);
    expect(
      checkCandidate(wedding, { type: "move_assets", amount: 10_000_000, fromMonth: 0 }).ok,
    ).toBe(true);
  });
});

describe("simulateTool", () => {
  const ctx = context();

  it("runs the candidate alone and with the kept changes, over the real simulate()", () => {
    const kept = [{ type: "move_assets" as const, amount: 15_000_000, fromMonth: 0 }];
    const result = simulateTool(ctx, kept, {
      type: "pay_off_loan",
      loanId: "paylater-1",
      fromMonth: 0,
    });
    if (!result.ok) throw new Error(result.error);
    const input = { snapshot: houseA.snapshot, profile: houseA.profile, goal: houseA.goal, rules };
    expect(result.outcome.alone).toEqual(simulate({ ...input, changes: [result.outcome.change] }));
    expect(result.outcome.cumulative).toEqual(
      simulate({ ...input, changes: [...kept, result.outcome.change] }),
    );
    expect(result.outcome.alone.loan?.monthsToReady).toBe(17);
    expect(result.outcome.cumulative.loan?.monthsToReady).toBeLessThan(17);
  });

  it("returns the validation error for a bad candidate", () => {
    expect(simulateTool(ctx, [], { type: "move_assets", fromMonth: 0 })).toMatchObject({
      ok: false,
    });
  });

  it("the view carries months per path, approvable today and month-0 failing", () => {
    const view = viewOf(ctx, ctx.withoutPlan);
    expect(view).toEqual({
      cash: { monthsToReady: null },
      loan: {
        monthsToReady: null,
        approvableToday: false,
        failingAtMonth0: ["dti_cap", "min_dp_first_home_new", "emergency_months_required"],
        blockedBy: ctx.withoutPlan.loan?.blockedBy,
      },
      leadingPath: "loan",
      leadingMonthsToReady: null,
    });
    const wedding = context(weddingC);
    const weddingView = viewOf(wedding, wedding.withoutPlan);
    expect(weddingView.loan).toBeUndefined();
    expect(weddingView.leadingMonthsToReady).toBe(25);
  });
});

describe("snapshot views", () => {
  const ctx = context();

  it("list_loans gives the real ids and figures", () => {
    expect(listLoansTool(ctx)).toEqual({
      loans: [
        {
          id: "paylater-1",
          lender: "PayLater",
          type: "paylater",
          outstandingPrincipal: 12_400_000,
          monthlyInstallment: 2_100_000,
          effectiveAnnualRate: 0.31,
          remainingTenorMonths: 8,
        },
      ],
      debtPaymentsPerMonth: 2_100_000,
      loanPath: true,
    });
  });

  it("list_spending_categories gives the categories largest first", () => {
    const view = listSpendingCategoriesTool(ctx);
    expect(view.categories[0]).toEqual({ category: "shopping", monthlySpend: 1_600_000 });
    expect(view.categories.map((c) => c.monthlySpend)).toEqual([
      1_600_000, 1_400_000, 1_000_000, 1_000_000,
    ]);
    expect(view.discretionaryTotal).toBe(5_000_000);
    expect(view.volatileAssets).toBe(15_000_000);
  });

  it("declares the three tools with a Gemini-compatible parameter schema", () => {
    const declarations = agentFunctionDeclarations(ctx);
    expect(declarations.map((d) => d.name)).toEqual([
      SIMULATE_TOOL,
      LIST_LOANS_TOOL,
      LIST_CATEGORIES_TOOL,
    ]);
    const schema = declarations[0]?.parametersJsonSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(Object.keys(schema.properties)).toEqual([
      "type",
      "fromMonth",
      "loanId",
      "newAnnualRate",
      "newTenorMonths",
      "category",
      "monthlyCap",
      "amount",
    ]);
    expect(schema.required).toEqual(["type", "fromMonth"]);
    expect(JSON.stringify(schema)).not.toContain("$schema");
    expect(agentFunctionDeclarations(context(weddingC))[0]?.description).toMatch(/no loan path/);
  });
});
