import type { SimulationResult } from "@adidi/shared";
import { type ActionFacts, monthsText, productName } from "./cards.js";
import { type AgentContext, leadingMonths } from "./context.js";

// The headline sentence of the result page (specs/06-agent.md, "Summary"): Gemini writes it
// from the months with and without the plan; code supplies those numbers, checks the text and
// has a template ready. The demo pins the shape: the with-plan months (or "this month") and
// the without-plan months both appear.

export interface SummaryFacts {
  /** Label → value, everything the writer may quote. */
  facts: Record<string, string>;
  /** The code-built sentence, used when the model's fails the check or there is no plan. */
  fallback: string;
}

export function buildSummaryFacts(
  ctx: AgentContext,
  withPlan: SimulationResult,
  actions: ActionFacts[],
): SummaryFacts {
  const without = leadingMonths(ctx, ctx.withoutPlan);
  const withIt = leadingMonths(ctx, withPlan);
  const first = actions[0];
  const facts: Record<string, string> = {
    goal: goalPhrase(ctx),
    withoutPlan: when(without),
    withPlan: when(withIt),
    horizon: "30 years",
    actionsInPlan: String(actions.length),
    ...(first ? { firstAction: actionPhrase(first), firstImpact: first.impact } : {}),
  };
  return { facts, fallback: fallbackSummary(ctx, without, withIt, first) };
}

export function fallbackSummary(
  ctx: AgentContext,
  without: number | null,
  withIt: number | null,
  first: ActionFacts | undefined,
): string {
  const goal = goalPhrase(ctx);
  const loan = ctx.leadingPath === "loan";
  const nothing =
    without === null
      ? `not within 30 years if nothing changes`
      : `${when(without)} if nothing changes`;
  if (!first) {
    if (without === 0)
      return loan
        ? `You could apply for a ${goal} this month.`
        : `Your ${goal} is covered this month.`;
    if (without === null) {
      return loan
        ? `A ${goal} is not within reach in 30 years on today's numbers, and nothing we tested changes that.`
        : `Your ${goal} is not within reach in 30 years on today's numbers, and nothing we tested changes that.`;
    }
    return loan
      ? `You're ${monthsText(without)} from a ${goal} on today's numbers.`
      : `You're ${monthsText(without)} from your ${goal} on today's numbers.`;
  }
  const action = actionPhrase(first);
  if (withIt === 0) {
    return loan
      ? `You could apply for a ${goal} this month if you ${action}; ${nothing}.`
      : `Your ${goal} is covered this month if you ${action}; ${nothing}.`;
  }
  if (withIt === null) {
    return loan
      ? `A ${goal} stays out of reach within 30 years even with the plan; ${action} is still the first step, because it ${lower(first.impact)}.`
      : `Your ${goal} stays out of reach within 30 years even with the plan; ${action} is still the first step, because it ${lower(first.impact)}.`;
  }
  return loan
    ? `You're ${monthsText(withIt)} from a ${goal}, if you ${action} first; ${nothing}.`
    : `You're ${monthsText(withIt)} from your ${goal}, if you ${action} first; ${nothing}.`;
}

/** "this month", "14 months", "not within 30 years". */
export function when(m: number | null): string {
  if (m === null) return "not within 30 years";
  return m === 0 ? "this month" : monthsText(m);
}

function goalPhrase(ctx: AgentContext): string {
  return ctx.goal.type === "wedding" ? "wedding budget" : productName(ctx);
}

/** A short imperative phrase for the first action, made of its facts only. */
export function actionPhrase(f: ActionFacts): string {
  const x = f.facts;
  switch (f.change.type) {
    case "pay_off_loan":
      return `clear the ${x.lender} balance`;
    case "refinance_loan":
      return `refinance the ${x.lender} loan`;
    case "cap_spending":
      return `cap ${x.category}`;
    case "move_assets":
      return `move ${x.amount} of volatile assets to safe savings`;
  }
}

function lower(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Every string the summary may take numbers from. */
export function allowedSummaryTexts(summary: SummaryFacts): string[] {
  return [summary.fallback, ...Object.values(summary.facts)];
}
