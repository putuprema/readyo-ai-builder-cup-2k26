import { simulate } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { ModelError } from "../gemini/client.js";
import {
  type ActionFacts,
  allowedTexts,
  buildActionFacts,
  impactText,
  timingChip,
} from "./cards.js";
import { createAgentContext } from "./context.js";
import { FakeJsonModel } from "./fakes.js";
import { type KeptAction, runProposeVerifyLoop } from "./loop.js";
import { checkNumbers, numbersIn, parseNumberToken } from "./numbers.js";
import { loadProfile, loadTestRules } from "./profiles.test-helper.js";
import { simulateTool } from "./tools.js";
import { verifyCandidate } from "./verify.js";
import { cardText, fallbackCard, writeCards, writerPrompt } from "./writer.js";

// specs/06-agent.md task 3: chips and monthsSaved from the simulation, Gemini-written text,
// and the number check that rejects any text with a number missing from its inputs.

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

/** A kept action straight from the tool and the verifier, without the model. */
function kept(ctx: ReturnType<typeof context>, args: Record<string, unknown>): KeptAction {
  const result = simulateTool(ctx, [], args);
  if (!result.ok) throw new Error(result.error);
  const verification = verifyCandidate(ctx, ctx.withoutPlan, result.outcome);
  return { change: result.outcome.change, alone: result.outcome.alone, verification };
}

describe("number check", () => {
  it("parses Indonesian and English number forms to one value", () => {
    expect(parseNumberToken("12.4")).toBe("12.4");
    expect(parseNumberToken("1.350.000")).toBe("1350000");
    expect(parseNumberToken("1,350,000")).toBe("1350000");
    expect(parseNumberToken("1,5")).toBe("1.5");
    expect(parseNumberToken("2026")).toBe("2026");
    expect(numbersIn("DTI 43% → 35%, Rp 12.4 m, 17 months")).toEqual(["43", "35", "12.4", "17"]);
  });

  it("accepts text whose numbers all come from the facts", () => {
    const facts = ["Rp 12.4 m", "31% a year", "17 months", "DTI 43% → 35%"];
    expect(checkNumbers("Pay off the Rp 12.4 m balance at 31% to cut DTI to 35%", facts)).toEqual({
      ok: true,
      offending: [],
    });
    expect(checkNumbers("No numbers at all", facts).ok).toBe(true);
  });

  it("rejects a converted, rounded or invented number", () => {
    const facts = ["Rp 12.4 m", "31% a year", "17 months"];
    expect(checkNumbers("Rp 12,400,000 at 0.31 for 2 years", facts)).toEqual({
      ok: false,
      offending: ["12,400,000", "0.31", "2"],
    });
    expect(checkNumbers("about Rp 12 m", facts).offending).toEqual(["12"]);
  });
});

describe("buildActionFacts", () => {
  const ctx = context();

  it("pay-off: months saved from never, interest saved, pay-off month, DTI unchanged at month 0", () => {
    const facts = buildActionFacts(
      ctx,
      kept(ctx, { type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 }),
      0,
    );
    expect(facts.id).toBe("a1");
    expect(facts.monthsSaved).toBe(361 - 17);
    expect(facts.impact).toBe("Approval in 17 months; not within 30 years without it");
    // Rp 2.1 m x 8 - Rp 12.4 m = Rp 4.4 m of interest and fees.
    expect(facts.chips).toContain("Interest saved Rp 4.4 m");
    // Rp 4 m liquid cannot cover Rp 12.4 m this month; the simulator pays when it can.
    expect(facts.chips.some((c) => /^Paid off in month \d+$/.test(c))).toBe(true);
    expect(facts.chips.length).toBeLessThanOrEqual(3);
    expect(facts.facts).toMatchObject({
      goal: "KPR",
      lender: "PayLater",
      outstanding: "Rp 12.4 m",
      installment: "Rp 2.1 m a month",
      rate: "31% a year",
      monthsLeft: "8 months",
      readyWithoutIt: "not within 30 years",
      readyWithIt: "month 17",
      dtiCap: "35%",
      timing: "Do this month",
    });
  });

  it("refinance: installment and DTI chips, clears the cap without a finite approval", () => {
    const facts = buildActionFacts(
      ctx,
      kept(ctx, {
        type: "refinance_loan",
        loanId: "paylater-1",
        newAnnualRate: 0.13,
        newTenorMonths: 24,
        fromMonth: 0,
      }),
      1,
    );
    expect(facts.id).toBe("a2");
    expect(facts.monthsSaved).toBe(0);
    expect(facts.impact).toBe("Clears the debt-to-income cap this month");
    expect(facts.chips[0]).toBe("Installment Rp 2.1 m → Rp 590 k");
    expect(facts.chips).toContain("DTI 43% → 35%");
    expect(facts.facts.newRate).toBe("13% a year");
    expect(facts.facts.newTenor).toBe("24 months");
  });

  it("cap: saves per month and the savings rate", () => {
    const facts = buildActionFacts(
      ctx,
      kept(ctx, {
        type: "cap_spending",
        category: "food_delivery",
        monthlyCap: 500_000,
        fromMonth: 1,
      }),
      2,
    );
    expect(facts.chips).toEqual([
      "Saves Rp 900 k a month",
      "Savings rate 13% → 18%",
      "From next month",
    ]);
    expect(facts.facts).toMatchObject({
      category: "food delivery",
      spentNow: "Rp 1.4 m a month",
      cap: "Rp 500 k a month",
      month: "September",
    });
    expect(facts.impact).toBe("Approval in 15 months; not within 30 years without it");
  });

  it("move: volatile share and the month-0 effect", () => {
    const facts = buildActionFacts(
      ctx,
      kept(ctx, { type: "move_assets", amount: 15_000_000, fromMonth: 0 }),
      0,
    );
    expect(facts.chips[0]).toBe("Volatile share 79% → 0%");
    expect(facts.chips).toContain("Do this month");
    expect(facts.facts.amount).toBe("Rp 15 m");
    expect(facts.facts.emergencyFund).toBe("0.5 months → 2.4 months");
  });

  it("finite baseline: 'N months sooner' and monthsSaved = baseline - alone", () => {
    const demoLike = context({
      ...houseA,
      snapshot: { ...houseA.snapshot, liquidAssets: 60_000_000 },
    });
    expect(demoLike.withoutPlan.loan?.monthsToReady).toBe(8);
    const facts = buildActionFacts(
      demoLike,
      kept(demoLike, { type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 }),
      0,
    );
    const alone = simulate({ ...demoLike, changes: [facts.change] }).loan?.monthsToReady ?? 0;
    expect(facts.monthsSaved).toBe(8 - alone);
    expect(facts.impact).toBe(
      `Approval ${8 - alone === 1 ? "1 month" : `${8 - alone} months`} sooner`,
    );
  });

  it("wedding uses 'Ready' and the cash path", () => {
    const ctxW = context(weddingC);
    const facts = buildActionFacts(
      ctxW,
      kept(ctxW, { type: "move_assets", amount: 10_000_000, fromMonth: 0 }),
      0,
    );
    expect(facts.impact).toBe("Ready 3 months sooner");
    expect(facts.monthsSaved).toBe(3);
    expect(facts.facts.goal).toBe("wedding");
    expect(facts.facts.dtiCap).toBeUndefined();
  });

  it("timing chips", () => {
    expect(timingChip(0)).toBe("Do this month");
    expect(timingChip(1)).toBe("From next month");
    expect(timingChip(6)).toBe("From month 6");
    const k = kept(ctx, { type: "move_assets", amount: 15_000_000, fromMonth: 0 });
    expect(
      impactText(ctx, {
        ...k,
        verification: { ...k.verification, alone: { ...k.verification.alone, monthsAfter: 0 } },
      }),
    ).toBe("Approval this month; not within 30 years without it");
  });
});

describe("writeCards", () => {
  const ctx = context();
  const facts = [
    buildActionFacts(
      ctx,
      kept(ctx, { type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 }),
      0,
    ),
    buildActionFacts(
      ctx,
      kept(ctx, {
        type: "cap_spending",
        category: "food_delivery",
        monthlyCap: 500_000,
        fromMonth: 1,
      }),
      1,
    ),
  ];
  const good = {
    cards: [
      {
        id: "a1",
        title: "Pay off the Rp 12.4 m PayLater balance",
        impactLine: "Approval in 17 months instead of never",
        description:
          "The PayLater costs Rp 2.1 m a month at 31% a year for another 8 months. Clearing it removes that installment from your debt-to-income and saves Rp 4.4 m of interest.",
      },
      {
        id: "a2",
        title: "Cap food delivery at Rp 500 k a month",
        impactLine: "Approval in 15 months instead of never",
        description:
          "Food delivery was Rp 1.4 m a month in September. Capping it adds Rp 900 k a month to your KPR down payment.",
      },
    ],
  };

  it("accepts text whose numbers are all in the facts and builds the cards", async () => {
    const model = new FakeJsonModel([good]);
    const result = await writeCards(ctx, facts, model);
    expect(result.attempts).toBe(1);
    expect(result.fallbackIds).toEqual([]);
    expect(result.cards.map((c) => c.id)).toEqual(["a1", "a2"]);
    expect(result.cards[0]).toMatchObject({
      title: good.cards[0]?.title,
      chips: facts[0]?.chips,
      monthsSaved: facts[0]?.monthsSaved,
      change: facts[0]?.change,
    });
    const prompt = model.requests[0]?.prompt ?? "";
    expect(prompt).toContain("Action a1: pay off a loan early");
    expect(prompt).toContain("- outstanding: Rp 12.4 m");
    expect(model.requests[0]?.responseJsonSchema).toMatchObject({ type: "object" });
  });

  it("retries once with the offending numbers named, then accepts", async () => {
    const bad = structuredClone(good);
    if (bad.cards[0]) bad.cards[0].description = "Pay Rp 12,400,000 at 0.31 a year.";
    const model = new FakeJsonModel([bad, good]);
    const logs: string[] = [];
    const result = await writeCards(ctx, facts, model, { log: (m) => logs.push(m) });
    expect(result.attempts).toBe(2);
    expect(result.fallbackIds).toEqual([]);
    expect(result.warnings[0]).toContain("a1: 12,400,000, 0.31");
    const retryPrompt = model.requests[1]?.prompt ?? "";
    expect(retryPrompt).toContain("numbers that are not in the facts");
    expect(retryPrompt).toContain("Action a1");
    expect(retryPrompt).not.toContain("Action a2"); // a2 was accepted on the first try
  });

  it("falls back to template text after the retry fails, and the template passes the check", async () => {
    const bad = structuredClone(good);
    if (bad.cards[1]) bad.cards[1].title = "Cap food delivery at Rp 0.5 m";
    const model = new FakeJsonModel([bad]);
    const result = await writeCards(ctx, facts, model);
    expect(result.attempts).toBe(2);
    expect(result.fallbackIds).toEqual(["a2"]);
    const card = result.cards[1];
    expect(card?.title).toBe("Cap food delivery at Rp 500 k a month");
    expect(card?.impactLine).toBe(facts[1]?.impact);
    for (const [i, c] of result.cards.entries()) {
      const fact = facts[i] as ActionFacts;
      expect(checkNumbers(cardText(c), allowedTexts(fact)).ok).toBe(true);
    }
  });

  it("every fallback template passes the number check for every change type", () => {
    const all = [
      ...facts,
      buildActionFacts(
        ctx,
        kept(ctx, {
          type: "refinance_loan",
          loanId: "paylater-1",
          newAnnualRate: 0.13,
          newTenorMonths: 24,
          fromMonth: 0,
        }),
        2,
      ),
      buildActionFacts(
        ctx,
        kept(ctx, { type: "move_assets", amount: 15_000_000, fromMonth: 0 }),
        3,
      ),
    ];
    for (const f of all) {
      const card = fallbackCard(ctx, f);
      expect(checkNumbers(cardText(card), allowedTexts(f)), card.title).toEqual({
        ok: true,
        offending: [],
      });
      expect(card.title.length).toBeGreaterThan(10);
    }
  });

  it("a model error counts as an attempt and ends in the template", async () => {
    const model = new FakeJsonModel([new ModelError("api_error", "Gemini API error 500")]);
    const result = await writeCards(ctx, facts, model);
    expect(result.fallbackIds).toEqual(["a1", "a2"]);
    expect(result.warnings).toHaveLength(2);
    expect(result.cards).toHaveLength(2);
  });

  it("a card missing from the answer is asked for again", async () => {
    const partial = { cards: [good.cards[0]] };
    const model = new FakeJsonModel([partial, good]);
    const result = await writeCards(ctx, facts, model);
    expect(result.fallbackIds).toEqual([]);
    expect(result.warnings[0]).toContain("a2: missing");
  });

  it("writes nothing when nothing was kept", async () => {
    const model = new FakeJsonModel([good]);
    const result = await writeCards(ctx, [], model);
    expect(result.cards).toEqual([]);
    expect(model.requests).toHaveLength(0);
  });

  it("the writer prompt carries the leading path", () => {
    expect(writerPrompt(ctx, facts)).toContain("Leading path: KPR approval");
    expect(writerPrompt(context(weddingC), [])).toContain("Leading path: cash");
  });
});

describe("end to end without the model's prose: loop then cards", () => {
  it("House-A cards: monthsSaved is each action alone against doing nothing", async () => {
    const ctx = context();
    const { FakeToolModel, call } = await import("./fakes.js");
    const model = new FakeToolModel([
      [call("simulate", { type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 })],
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
    const loop = await runProposeVerifyLoop(ctx, model);
    const facts = loop.kept.map((k, i) => buildActionFacts(ctx, k, i));
    const input = { snapshot: ctx.snapshot, profile: ctx.profile, goal: ctx.goal, rules };
    for (const f of facts) {
      const alone = simulate({ ...input, changes: [f.change] }).loan?.monthsToReady;
      expect(f.monthsSaved).toBe(361 - (alone ?? 361));
      expect(f.monthsSaved).toBeGreaterThan(0);
    }
    expect(facts.map((f) => f.id)).toEqual(["a1", "a2", "a3"]);
  });
});
