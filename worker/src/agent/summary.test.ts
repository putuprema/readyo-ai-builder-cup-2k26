import { simulate } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { buildActionFacts } from "./cards.js";
import { createAgentContext } from "./context.js";
import { call, FakeJsonModel, FakeToolModel, hang } from "./fakes.js";
import { runAgent } from "./index.js";
import type { KeptAction } from "./loop.js";
import { checkNumbers } from "./numbers.js";
import { loadProfile, loadTestRules } from "./profiles.test-helper.js";
import { allowedSummaryTexts, buildSummaryFacts, fallbackSummary, when } from "./summary.js";
import { simulateTool } from "./tools.js";
import { verifyCandidate } from "./verify.js";
import { writeCards } from "./writer.js";

// specs/06-agent.md task 5: the headline sentence, and runAgent() end to end with fakes.

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

function kept(ctx: ReturnType<typeof context>, args: Record<string, unknown>): KeptAction {
  const result = simulateTool(ctx, [], args);
  if (!result.ok) throw new Error(result.error);
  const verification = verifyCandidate(ctx, ctx.withoutPlan, result.outcome);
  return { change: result.outcome.change, alone: result.outcome.alone, verification };
}

const payOffArgs = { type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 };

describe("summary facts and the template", () => {
  it("House-A: never without the plan, a month with it", () => {
    const ctx = context();
    const k = kept(ctx, payOffArgs);
    const facts = [buildActionFacts(ctx, k, 0)];
    const summary = buildSummaryFacts(ctx, k.alone, facts);
    expect(summary.facts).toMatchObject({
      goal: "KPR",
      withoutPlan: "not within 30 years",
      withPlan: "17 months",
      firstAction: "clear the PayLater balance",
      actionsInPlan: "1",
    });
    expect(summary.fallback).toBe(
      "You're 17 months from a KPR, if you clear the PayLater balance first; not within 30 years if nothing changes.",
    );
    expect(checkNumbers(summary.fallback, allowedSummaryTexts(summary)).ok).toBe(true);
  });

  it("finite both ways, and this month with the plan", () => {
    const ctx = context({ ...houseA, snapshot: { ...houseA.snapshot, liquidAssets: 60_000_000 } });
    const k = kept(ctx, payOffArgs);
    const facts = [buildActionFacts(ctx, k, 0)];
    const months = k.alone.loan?.monthsToReady ?? 0;
    expect(fallbackSummary(ctx, 8, months, facts[0])).toBe(
      `You're ${months} months from a KPR, if you clear the PayLater balance first; 8 months if nothing changes.`,
    );
    expect(fallbackSummary(ctx, 8, 0, facts[0])).toBe(
      "You could apply for a KPR this month if you clear the PayLater balance; 8 months if nothing changes.",
    );
  });

  it("no plan, and a plan that still never gets there", () => {
    const ctx = context();
    expect(fallbackSummary(ctx, null, null, undefined)).toBe(
      "A KPR is not within reach in 30 years on today's numbers, and nothing we tested changes that.",
    );
    expect(fallbackSummary(ctx, 8, 8, undefined)).toBe(
      "You're 8 months from a KPR on today's numbers.",
    );
    expect(fallbackSummary(ctx, 0, 0, undefined)).toBe("You could apply for a KPR this month.");
    const refi = buildActionFacts(
      ctx,
      kept(ctx, {
        type: "refinance_loan",
        loanId: "paylater-1",
        newAnnualRate: 0.13,
        newTenorMonths: 24,
        fromMonth: 0,
      }),
      0,
    );
    expect(fallbackSummary(ctx, null, null, refi)).toBe(
      "A KPR stays out of reach within 30 years even with the plan; refinance the PayLater loan is still the first step, because it clears the debt-to-income cap this month.",
    );
  });

  it("wedding: the cash path and the wedding budget", () => {
    const ctx = context(weddingC);
    const k = kept(ctx, {
      type: "cap_spending",
      category: "food_delivery",
      monthlyCap: 300_000,
      fromMonth: 1,
    });
    const facts = [buildActionFacts(ctx, k, 0)];
    const summary = buildSummaryFacts(ctx, k.alone, facts);
    expect(summary.fallback).toMatch(
      /^You're \d+ months from your wedding budget, if you cap food delivery first; 25 months if nothing changes\.$/,
    );
    expect(when(0)).toBe("this month");
    expect(when(1)).toBe("1 month");
    expect(when(null)).toBe("not within 30 years");
  });
});

describe("writer with the summary", () => {
  const ctx = context();
  const k = kept(ctx, payOffArgs);
  const facts = [buildActionFacts(ctx, k, 0)];
  const summary = buildSummaryFacts(ctx, k.alone, facts);
  const card = {
    id: "a1",
    title: "Pay off the Rp 12.4 m PayLater balance",
    impactLine: "Approval in 17 months instead of never",
    description: "Clearing it removes the Rp 2.1 m a month installment from your debt-to-income.",
  };

  it("accepts a summary whose numbers are in the facts", async () => {
    const model = new FakeJsonModel([
      {
        cards: [card],
        summary:
          "You're 17 months from a KPR if you clear the PayLater first; not within 30 years if nothing changes.",
      },
    ]);
    const result = await writeCards(ctx, facts, model, { summary });
    expect(result.summaryFromFallback).toBe(false);
    expect(result.summary).toContain("17 months");
    expect(model.requests[0]?.prompt).toContain("Summary facts (for the headline sentence):");
    expect(model.requests[0]?.prompt).toContain("- withPlan: 17 months");
    expect(model.requests[0]?.prompt).toContain("Write the cards and the summary.");
  });

  it("rejects a summary with an invented number and retries the summary alone", async () => {
    const model = new FakeJsonModel([
      { cards: [card], summary: "You're 18 months from a KPR; never otherwise." },
      { cards: [], summary: "You're 17 months from a KPR; not within 30 years otherwise." },
    ]);
    const result = await writeCards(ctx, facts, model, { summary });
    expect(result.attempts).toBe(2);
    expect(result.fallbackIds).toEqual([]);
    expect(result.summaryFromFallback).toBe(false);
    expect(result.summary).toBe("You're 17 months from a KPR; not within 30 years otherwise.");
    expect(result.warnings[0]).toContain("summary: 18");
    expect(model.requests[1]?.prompt).not.toContain("Action a1");
    expect(model.requests[1]?.prompt).toContain("Summary facts");
  });

  it("falls back to the template summary after the retry", async () => {
    const model = new FakeJsonModel([{ cards: [card], summary: "" }]);
    const result = await writeCards(ctx, facts, model, { summary });
    expect(result.summaryFromFallback).toBe(true);
    expect(result.summary).toBe(summary.fallback);
    expect(result.warnings[0]).toContain("summary: missing");
  });

  it("no actions: the template summary without a model call", async () => {
    const model = new FakeJsonModel([{ cards: [], summary: "unused" }]);
    const empty = buildSummaryFacts(ctx, ctx.withoutPlan, []);
    const result = await writeCards(ctx, [], model, { summary: empty });
    expect(model.requests).toHaveLength(0);
    expect(result.summary).toBe(empty.fallback);
    expect(result.summaryFromFallback).toBe(true);
  });
});

describe("runAgent", () => {
  it("House-A end to end with fakes: the analysis pieces, verified", async () => {
    const toolModel = new FakeToolModel([
      [call("simulate", payOffArgs)],
      [call("simulate", { type: "move_assets", amount: 15_000_000, fromMonth: 0 })],
      [
        call("simulate", {
          type: "cap_spending",
          category: "food_delivery",
          monthlyCap: 500_000,
          fromMonth: 1,
        }),
      ],
    ]);
    const jsonModel = new FakeJsonModel([{ cards: [], summary: "" }]); // forces the templates
    const model = {
      step: toolModel.step.bind(toolModel),
      generateJson: jsonModel.generateJson.bind(jsonModel),
    };
    const logs: string[] = [];
    const result = await runAgent(
      { snapshot: houseA.snapshot, profile: houseA.profile, goal: houseA.goal, rules },
      model,
      { log: (m) => logs.push(m) },
    );

    // Acceptance: at least one kept action with the PayLater pay-off among them, and the plan
    // beats the baseline (null baseline counts as later than any month).
    expect(result.actions.length).toBeGreaterThanOrEqual(1);
    expect(
      result.actions.some(
        (a) => a.change.type === "pay_off_loan" && a.change.loanId === "paylater-1",
      ),
    ).toBe(true);
    expect(result.withoutPlan.loan?.monthsToReady).toBeNull();
    expect(result.withPlan.loan?.monthsToReady).toBe(11);
    expect(result.toolCalls).toBeLessThanOrEqual(8);
    expect(result.choices).toEqual({ a1: "undecided", a2: "undecided", a3: "undecided" });
    expect(result.rejectedOptions).toEqual(result.withoutPlan.rejectedOptions);
    expect(result.summary).toBe(
      "You're 11 months from a KPR, if you move Rp 15 m of volatile assets to safe savings first; not within 30 years if nothing changes.",
    );
    expect(result.fallbackIds).toEqual(["a1", "a2", "a3"]);
    expect(result.summaryFromFallback).toBe(true);
    expect(result.stoppedBecause).toBe("actions");

    // Every kept action alone improves on doing nothing, re-verified without the model.
    const input = { snapshot: houseA.snapshot, profile: houseA.profile, goal: houseA.goal, rules };
    for (const a of result.actions) {
      const alone = simulate({ ...input, changes: [a.change] });
      expect(alone.loan?.monthsToReady).not.toBeNull();
      expect(a.monthsSaved).toBe(361 - (alone.loan?.monthsToReady ?? 361));
      expect(a.chips.length).toBeGreaterThan(0);
      expect(a.title.length).toBeGreaterThan(0);
    }
    expect(logs.some((l) => l.includes("3 action(s) kept after 3 tool call(s)"))).toBe(true);
  });

  it("a timed-out model turn still ends with the kept actions and written cards", async () => {
    const toolModel = new FakeToolModel([[call("simulate", payOffArgs)], hang]);
    const jsonModel = new FakeJsonModel([{ cards: [], summary: "" }]); // forces the templates
    const model = {
      step: toolModel.step.bind(toolModel),
      generateJson: jsonModel.generateJson.bind(jsonModel),
    };
    const result = await runAgent(
      { snapshot: houseA.snapshot, profile: houseA.profile, goal: houseA.goal, rules },
      model,
      { turnTimeoutMs: 20 },
    );
    expect(result.stoppedBecause).toBe("model_timeout");
    expect(result.actions.map((a) => a.change.type)).toEqual(["pay_off_loan"]);
    expect(result.choices).toEqual({ a1: "undecided" });
    expect(result.withPlan.loan?.monthsToReady).toBe(17);
    // The writer ran after the timeout.
    expect(jsonModel.requests.length).toBeGreaterThan(0);
    expect(result.actions[0]?.title.length).toBeGreaterThan(0);
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.warnings).toContain(
      "Agent loop ended early: a model turn took longer than 20 ms",
    );
  });

  it("wedding end to end: no loan field, savings actions only", async () => {
    const toolModel = new FakeToolModel([
      [
        call("simulate", {
          type: "refinance_loan",
          loanId: "kta-1",
          newAnnualRate: 0.1,
          newTenorMonths: 12,
          fromMonth: 0,
        }),
      ],
      [call("simulate", { type: "move_assets", amount: 10_000_000, fromMonth: 0 })],
      "Done.",
    ]);
    const jsonModel = new FakeJsonModel([{ cards: [], summary: "" }]);
    const result = await runAgent(
      { snapshot: weddingC.snapshot, profile: weddingC.profile, goal: weddingC.goal, rules },
      {
        step: toolModel.step.bind(toolModel),
        generateJson: jsonModel.generateJson.bind(jsonModel),
      },
    );
    expect(result.actions.map((a) => a.change.type)).toEqual(["move_assets"]);
    expect(result.withPlan.loan).toBeUndefined();
    expect(result.summary).toBe(
      "You're 22 months from your wedding budget, if you move Rp 10 m of volatile assets to safe savings first; 25 months if nothing changes.",
    );
  });

  it("nothing kept: no cards, template summary, no writer call", async () => {
    const toolModel = new FakeToolModel(["Nothing helps."]);
    const jsonModel = new FakeJsonModel([{ cards: [], summary: "" }]);
    const result = await runAgent(
      { snapshot: houseA.snapshot, profile: houseA.profile, goal: houseA.goal, rules },
      {
        step: toolModel.step.bind(toolModel),
        generateJson: jsonModel.generateJson.bind(jsonModel),
      },
    );
    expect(result.actions).toEqual([]);
    expect(result.choices).toEqual({});
    expect(result.withPlan).toBe(result.withoutPlan);
    expect(result.summary).toBe(
      "A KPR is not within reach in 30 years on today's numbers, and nothing we tested changes that.",
    );
    expect(jsonModel.requests).toHaveLength(0);
  });
});
