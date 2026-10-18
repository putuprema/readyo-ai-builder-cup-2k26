import { writeFileSync } from "node:fs";
import { demoGoal, demoProfile, demoRules, demoSnapshot, simulate } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { createGeminiModel } from "../gemini/client.js";
import { allowedTexts } from "./cards.js";
import { runAgent } from "./index.js";
import { checkNumbers } from "./numbers.js";
import { loadProfile, loadTestRules } from "./profiles.test-helper.js";
import { cardText } from "./writer.js";

// One real run of the agent against Gemini (specs/06-agent.md acceptance criteria that need the
// model: House-A keeps the PayLater pay-off or refinance; wedding gets savings actions only;
// at most 8 tool calls; no card text with a number missing from its inputs). Skipped without
// GEMINI_API_KEY so `pnpm test` stays offline. Run with: pnpm --filter worker test:live
//
// The run's cards and trace are written to AGENT_LIVE_OUT (default: none) for the deck.

const enabled = Boolean(process.env.GEMINI_API_KEY);
const rules = loadTestRules();

describe.skipIf(!enabled)("live agent run", () => {
  const model = enabled ? createGeminiModel() : undefined;

  it("House-A: a verified plan with the PayLater action, within 8 tool calls, numbers checked", async () => {
    if (!model) return;
    const f = loadProfile("house-a");
    const logs: string[] = [];
    const result = await runAgent(
      { snapshot: f.snapshot, profile: f.profile, goal: f.goal, rules },
      model,
      { log: (m) => logs.push(m) },
    );
    dump("house-a", result, logs);

    expect(result.toolCalls).toBeLessThanOrEqual(8);
    expect(result.actions.length).toBeGreaterThanOrEqual(1);
    expect(
      result.actions.some(
        (a) =>
          (a.change.type === "pay_off_loan" || a.change.type === "refinance_loan") &&
          a.change.loanId === "paylater-1",
      ),
    ).toBe(true);
    const without = result.withoutPlan.loan?.monthsToReady ?? Number.POSITIVE_INFINITY;
    const withPlan = result.withPlan.loan?.monthsToReady ?? Number.POSITIVE_INFINITY;
    expect(withPlan).toBeLessThan(without);

    // Re-verified without the model: each action alone improves on doing nothing.
    const input = { snapshot: f.snapshot, profile: f.profile, goal: f.goal, rules };
    const baselineFailing = result.withoutPlan.loan?.timeline[0]?.failing ?? [];
    for (const a of result.actions) {
      const alone = simulate({ ...input, changes: [a.change] });
      const months = alone.loan?.monthsToReady ?? Number.POSITIVE_INFINITY;
      const failing = alone.loan?.timeline[0]?.failing ?? [];
      const cleared = baselineFailing.some((r) => !failing.includes(r));
      expect(months < without || cleared, JSON.stringify(a.change)).toBe(true);
    }
    // Every card's text passed the number check (or is the template, which passes too).
    for (const [i, a] of result.actions.entries()) {
      const facts = result.facts[i];
      if (!facts) throw new Error("facts missing");
      expect(checkNumbers(cardText(a), allowedTexts(facts))).toEqual({ ok: true, offending: [] });
    }
    expect(result.summary.length).toBeGreaterThan(20);
  }, 600_000);

  it("Wedding-C: no loan actions, savings only", async () => {
    if (!model) return;
    const f = loadProfile("wedding-c");
    const logs: string[] = [];
    const result = await runAgent(
      { snapshot: f.snapshot, profile: f.profile, goal: f.goal, rules },
      model,
      { log: (m) => logs.push(m) },
    );
    dump("wedding-c", result, logs);
    expect(result.toolCalls).toBeLessThanOrEqual(8);
    expect(result.withPlan.loan).toBeUndefined();
    for (const a of result.actions) {
      expect(["cap_spending", "move_assets"]).toContain(a.change.type);
    }
  }, 600_000);

  it("demo profile: approval sooner with the plan, the story the deck tells", async () => {
    if (!model) return;
    const logs: string[] = [];
    const result = await runAgent(
      { snapshot: demoSnapshot, profile: demoProfile, goal: demoGoal, rules: demoRules },
      model,
      { log: (m) => logs.push(m) },
    );
    dump("demo", result, logs);
    expect(result.toolCalls).toBeLessThanOrEqual(8);
    expect(result.actions.length).toBeGreaterThanOrEqual(1);
    const without = result.withoutPlan.loan?.monthsToReady ?? Number.POSITIVE_INFINITY;
    const withPlan = result.withPlan.loan?.monthsToReady ?? Number.POSITIVE_INFINITY;
    expect(withPlan).toBeLessThan(without);
    expect(result.summary).toContain(`${without} months`);
  }, 600_000);
});

function dump(name: string, result: Awaited<ReturnType<typeof runAgent>>, logs: string[]) {
  const out = process.env.AGENT_LIVE_OUT;
  if (!out) return;
  const { withoutPlan, withPlan, ...rest } = result;
  writeFileSync(
    `${out}/agent-${name}.json`,
    JSON.stringify(
      {
        ...rest,
        monthsWithoutPlan: withoutPlan.loan?.monthsToReady ?? withoutPlan.cash.monthsToReady,
        monthsWithPlan: withPlan.loan?.monthsToReady ?? withPlan.cash.monthsToReady,
        logs,
      },
      null,
      2,
    ),
  );
}
