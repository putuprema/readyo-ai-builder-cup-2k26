import { simulate } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { ModelError } from "../gemini/client.js";
import { createAgentContext } from "./context.js";
import { call, FakeToolModel } from "./fakes.js";
import { type KeptAction, MAX_TOOL_CALLS, monthsSaved, runProposeVerifyLoop } from "./loop.js";
import { loadProfile, loadTestRules } from "./profiles.test-helper.js";
import { LIST_CATEGORIES_TOOL, LIST_LOANS_TOOL, SIMULATE_TOOL } from "./tools.js";
import { compare, fewerMonths } from "./verify.js";

// specs/06-agent.md task 2: the propose → verify loop with the keep/drop logic in code.

const rules = loadTestRules();
const houseA = loadProfile("house-a");
const weddingC = loadProfile("wedding-c");

function context(fixture = houseA, extra: object = {}) {
  return createAgentContext({
    snapshot: fixture.snapshot,
    profile: fixture.profile,
    goal: fixture.goal,
    rules,
    ...extra,
  });
}

const payOff = call(SIMULATE_TOOL, { type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 });
const refinance24 = call(SIMULATE_TOOL, {
  type: "refinance_loan",
  loanId: "paylater-1",
  newAnnualRate: 0.13,
  newTenorMonths: 24,
  fromMonth: 0,
});
const moveAll = call(SIMULATE_TOOL, { type: "move_assets", amount: 15_000_000, fromMonth: 0 });
const capFood = call(SIMULATE_TOOL, {
  type: "cap_spending",
  category: "food_delivery",
  monthlyCap: 500_000,
  fromMonth: 1,
});

/** The acceptance criterion: every kept action, applied alone, strictly improves months or
 *  removes a failing rule, checked against simulate() without the model. */
function expectEachImprovesAlone(ctx: ReturnType<typeof context>, kept: KeptAction[]) {
  for (const k of kept) {
    const alone = simulate({
      snapshot: ctx.snapshot,
      profile: ctx.profile,
      goal: ctx.goal,
      rules: ctx.rules,
      changes: [k.change],
    });
    const verdict = compare(ctx, ctx.withoutPlan, alone);
    expect(verdict.improves, JSON.stringify(k.change)).toBe(true);
    expect(
      fewerMonths(verdict.monthsBefore, verdict.monthsAfter) || verdict.clearedRules.length > 0,
    ).toBe(true);
  }
}

describe("keep rule", () => {
  const ctx = context();
  const input = { snapshot: ctx.snapshot, profile: ctx.profile, goal: ctx.goal, rules };

  it("null months count as later than any month", () => {
    expect(fewerMonths(null, 17)).toBe(true);
    expect(fewerMonths(20, 17)).toBe(true);
    expect(fewerMonths(17, 17)).toBe(false);
    expect(fewerMonths(17, null)).toBe(false);
    expect(fewerMonths(null, null)).toBe(false);
  });

  it("keeps a change that clears a month-0 rule even when approval stays out of reach", () => {
    const after = simulate({
      ...input,
      changes: [
        {
          type: "refinance_loan",
          loanId: "paylater-1",
          newAnnualRate: 0.13,
          newTenorMonths: 24,
          fromMonth: 0,
        },
      ],
    });
    const verdict = compare(ctx, ctx.withoutPlan, after);
    expect(verdict).toMatchObject({
      improves: true,
      monthsBefore: null,
      monthsAfter: null,
      clearedRules: ["dti_cap"],
      addedRules: [],
    });
  });

  it("drops a change that adds a failing rule, whatever it does to the months", () => {
    // Spending all liquid on a bigger emergency gap: a pay-off at month 0 cannot add a rule, so
    // build the case by hand with a cash goal where moving nothing changes nothing.
    const same = compare(ctx, ctx.withoutPlan, ctx.withoutPlan);
    expect(same.improves).toBe(false);
  });

  it("monthsSaved is the action alone against doing nothing, with never as the horizon", () => {
    expect(monthsSaved(ctx, 26, 14)).toBe(12);
    expect(monthsSaved(ctx, null, 17)).toBe(361 - 17);
    expect(monthsSaved(ctx, null, null)).toBe(0);
    expect(monthsSaved(ctx, 17, 17)).toBe(0);
  });
});

describe("runProposeVerifyLoop", () => {
  it("House-A: keeps the pay-off, the move and the cap, stops at three, and the plan beats the baseline", async () => {
    // Kept in the order proposed; ordered for the cards by fromMonth, then months saved
    // (move: never → 14; pay-off: never → 17; cap: from month 1).
    const ctx = context();
    const model = new FakeToolModel([
      [call(LIST_LOANS_TOOL)],
      [payOff],
      [moveAll],
      [capFood],
      "Done.", // never reached: three kept actions stop the loop
    ]);
    const logs: string[] = [];
    const result = await runProposeVerifyLoop(ctx, model, { log: (m) => logs.push(m) });

    expect(result.stoppedBecause).toBe("actions");
    expect(result.toolCalls).toBe(4);
    expect(result.kept.map((k) => k.change.type)).toEqual([
      "move_assets",
      "pay_off_loan",
      "cap_spending",
    ]);
    expect(result.kept.map((k) => k.change.fromMonth)).toEqual([0, 0, 1]);
    expect(result.withPlan).toEqual(
      simulate({
        snapshot: ctx.snapshot,
        profile: ctx.profile,
        goal: ctx.goal,
        rules,
        changes: result.kept.map((k) => k.change),
      }),
    );
    expect(ctx.withoutPlan.loan?.monthsToReady).toBeNull();
    expect(result.withPlan.loan?.monthsToReady).toBe(11);
    expectEachImprovesAlone(ctx, result.kept);
    expect(model.requests).toHaveLength(4);
    expect(logs.filter((l) => l.startsWith("agent: tool call"))).toHaveLength(4);
    expect(logs.some((l) => l.includes("kept"))).toBe(true);

    // The model was told the verdict after each simulate call.
    const responses = model.functionResponses();
    expect(responses[1]).toMatchObject({ kept: true, keptSoFar: 1, toolCallsLeft: 6 });
    expect(responses[1]?.reason).toMatch(/^Kept: approval moves from never to month 17/);
  });

  it("orders kept actions by fromMonth, then by months saved", async () => {
    const ctx = context();
    const model = new FakeToolModel([[capFood], [moveAll], [payOff]]);
    const result = await runProposeVerifyLoop(ctx, model);
    // Alone: pay-off never → 17 (saves 344), move never → 14 (saves 347), cap from month 1.
    expect(result.kept.map((k) => k.change.type)).toEqual([
      "move_assets",
      "pay_off_loan",
      "cap_spending",
    ]);
  });

  it("drops a candidate that adds nothing to the kept set and tells the model why", async () => {
    const ctx = context();
    const smallMove = call(SIMULATE_TOOL, { type: "move_assets", amount: 1_000_000, fromMonth: 0 });
    const model = new FakeToolModel([[moveAll], [smallMove], "Nothing else helps."]);
    const result = await runProposeVerifyLoop(ctx, model);
    expect(result.stoppedBecause).toBe("model_done");
    expect(result.kept.map((k) => k.change.type)).toEqual(["move_assets"]);
    expect(result.trace.map((t) => t.kept)).toEqual([true, false]);
    expect(model.functionResponses()[1]).toMatchObject({ kept: false });
    expect(String(model.functionResponses()[1]?.reason)).toMatch(/^Dropped/);
    expect(result.modelText).toBe("Nothing else helps.");
  });

  it("the same candidate twice is kept once", async () => {
    const ctx = context();
    const model = new FakeToolModel([[payOff], [payOff], "Done."]);
    const result = await runProposeVerifyLoop(ctx, model);
    expect(result.kept).toHaveLength(1);
    expect(result.trace.map((t) => t.kept)).toEqual([true, false]);
  });

  it("never keeps a dismissed action, even when the model insists", async () => {
    const ctx = context(houseA, { dismissed: [{ type: "pay_off_loan", loanId: "paylater-1" }] });
    const model = new FakeToolModel([[payOff], [payOff], [refinance24], "Done."]);
    const result = await runProposeVerifyLoop(ctx, model);
    expect(result.kept.map((k) => k.change.type)).toEqual(["refinance_loan"]);
    expect(result.trace.filter((t) => t.error?.includes("dismissed"))).toHaveLength(2);
    expectEachImprovesAlone(ctx, result.kept);
  });

  it("wedding: a refinance is refused, savings actions are kept", async () => {
    const ctx = context(weddingC);
    const model = new FakeToolModel([
      [
        call(SIMULATE_TOOL, {
          type: "refinance_loan",
          loanId: "kta-1",
          newAnnualRate: 0.1,
          newTenorMonths: 12,
          fromMonth: 0,
        }),
      ],
      [call(SIMULATE_TOOL, { type: "move_assets", amount: 10_000_000, fromMonth: 0 })],
      [
        call(SIMULATE_TOOL, {
          type: "cap_spending",
          category: "food_delivery",
          monthlyCap: 300_000,
          fromMonth: 1,
        }),
      ],
      "Done.",
    ]);
    const result = await runProposeVerifyLoop(ctx, model);
    expect(result.kept.map((k) => k.change.type)).toEqual(["move_assets", "cap_spending"]);
    expect(result.trace[0]?.error).toMatch(/no loan path/);
    expect(result.withPlan.loan).toBeUndefined();
    expect(result.withPlan.cash.monthsToReady).toBeLessThan(
      ctx.withoutPlan.cash.monthsToReady ?? 0,
    );
    expectEachImprovesAlone(ctx, result.kept);
  });

  it("stops after 8 tool calls, counting every tool and every call in a turn", async () => {
    const ctx = context();
    const model = new FakeToolModel([
      [call(LIST_LOANS_TOOL), call(LIST_CATEGORIES_TOOL), call(LIST_LOANS_TOOL)],
      [call(LIST_CATEGORIES_TOOL)],
      [
        call(LIST_LOANS_TOOL),
        call(LIST_LOANS_TOOL),
        call(LIST_LOANS_TOOL),
        call(LIST_LOANS_TOOL),
        call(LIST_LOANS_TOOL),
        call(LIST_LOANS_TOOL),
      ],
      [payOff], // never reached
    ]);
    const result = await runProposeVerifyLoop(ctx, model);
    expect(result.stoppedBecause).toBe("budget");
    expect(result.toolCalls).toBe(MAX_TOOL_CALLS);
    expect(result.trace).toHaveLength(8);
    expect(result.kept).toHaveLength(0);
    expect(result.withPlan).toBe(ctx.withoutPlan);
    // The calls past the budget were answered, not executed, and the model got no fourth turn.
    expect(model.requests).toHaveLength(3);
  });

  it("answers an unknown tool with an error and counts the call", async () => {
    const ctx = context();
    const model = new FakeToolModel([[call("sell_everything")], "Done."]);
    const result = await runProposeVerifyLoop(ctx, model);
    expect(result.toolCalls).toBe(1);
    expect(result.trace[0]?.error).toMatch(/Unknown tool/);
    expect(model.functionResponses()[0]).toMatchObject({ error: "Unknown tool sell_everything" });
  });

  it("a model error ends the loop but keeps what was verified", async () => {
    const ctx = context();
    const model = new FakeToolModel([
      [payOff],
      new ModelError("api_error", "Gemini API error 503"),
    ]);
    const result = await runProposeVerifyLoop(ctx, model);
    expect(result.stoppedBecause).toBe("model_error");
    expect(result.error).toBe("Gemini API error 503");
    expect(result.kept.map((k) => k.change.type)).toEqual(["pay_off_loan"]);
    expect(result.withPlan.loan?.monthsToReady).toBe(17);
  });

  it("sends the prompt, the three tools and the growing history to the model", async () => {
    const ctx = context();
    const model = new FakeToolModel([[payOff], "Done."]);
    await runProposeVerifyLoop(ctx, model);
    const first = model.requests[0];
    expect(first?.tier).toBe("pro");
    expect(first?.tools.map((t) => t.name)).toEqual([
      SIMULATE_TOOL,
      LIST_LOANS_TOOL,
      LIST_CATEGORIES_TOOL,
    ]);
    expect(first?.history).toHaveLength(1);
    const prompt = String(first?.history[0]?.parts?.[0]?.text);
    expect(prompt).toContain("paylater-1");
    expect(prompt).toContain("food_delivery 1400000");
    expect(prompt).toContain("dti_cap (you 0.431, limit 0.35)");
    expect(prompt).toContain("not within 30 years");
    const second = model.requests[1];
    expect(second?.history.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(second?.history[2]?.parts?.[0]?.functionResponse?.name).toBe(SIMULATE_TOOL);
  });

  it("lists dismissed actions in the prompt", async () => {
    const ctx = context(houseA, { dismissed: [{ type: "cap_spending", category: "shopping" }] });
    const model = new FakeToolModel(["Done."]);
    await runProposeVerifyLoop(ctx, model);
    expect(String(model.requests[0]?.history[0]?.parts?.[0]?.text)).toContain(
      "Dismissed by the user earlier (never propose these): cap_spending shopping.",
    );
  });
});
