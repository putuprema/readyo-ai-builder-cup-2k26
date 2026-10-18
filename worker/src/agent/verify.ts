import type { SimulationResult } from "@adidi/shared";
import { type AgentContext, failingAtMonth0, leadingMonths } from "./context.js";
import type { SimulateToolOutcome } from "./tools.js";

// The keep rule, in code (specs/06-agent.md, "Loop" step 3): a candidate is kept only if it
// reduces months to ready on the leading path or removes a rule from month-0 `failing`. It
// must do so both against the changes kept so far (so the plan never carries a redundant
// action) and on its own against doing nothing (so every card's monthsSaved is a real gain,
// as the acceptance criteria re-verify without the model).

export interface Verdict {
  improves: boolean;
  monthsBefore: number | null;
  monthsAfter: number | null;
  /** Month-0 rules that fail before and pass after. */
  clearedRules: string[];
  /** Month-0 rules that pass before and fail after; any of these cancels the improvement. */
  addedRules: string[];
}

/** Null (never within the horizon) compares as later than every month. */
export function fewerMonths(before: number | null, after: number | null): boolean {
  if (after === null) return false;
  return before === null || after < before;
}

export function compare(
  ctx: AgentContext,
  before: SimulationResult,
  after: SimulationResult,
): Verdict {
  const monthsBefore = leadingMonths(ctx, before);
  const monthsAfter = leadingMonths(ctx, after);
  const failingBefore = new Set(failingAtMonth0(ctx, before));
  const failingAfter = new Set(failingAtMonth0(ctx, after));
  const clearedRules = [...failingBefore].filter((r) => !failingAfter.has(r));
  const addedRules = [...failingAfter].filter((r) => !failingBefore.has(r));
  const improves =
    addedRules.length === 0 && (fewerMonths(monthsBefore, monthsAfter) || clearedRules.length > 0);
  return { improves, monthsBefore, monthsAfter, clearedRules, addedRules };
}

export interface Verification {
  kept: boolean;
  /** Why it was kept or dropped, in a sentence the model can act on. */
  reason: string;
  alone: Verdict;
  cumulative: Verdict;
}

/**
 * Decide whether to keep a simulated candidate. `keptResult` is the simulation of the changes
 * kept so far (the no-change result when nothing is kept yet).
 */
export function verifyCandidate(
  ctx: AgentContext,
  keptResult: SimulationResult,
  outcome: SimulateToolOutcome,
): Verification {
  const alone = compare(ctx, ctx.withoutPlan, outcome.alone);
  const cumulative = compare(ctx, keptResult, outcome.cumulative);
  const kept = alone.improves && cumulative.improves;
  return { kept, reason: describe(ctx, kept, alone, cumulative), alone, cumulative };
}

function describe(ctx: AgentContext, kept: boolean, alone: Verdict, cumulative: Verdict): string {
  const path = ctx.leadingPath === "loan" ? "approval" : "ready";
  const show = (m: number | null) => (m === null ? "never" : `month ${m}`);
  if (kept) {
    const parts: string[] = [];
    if (fewerMonths(cumulative.monthsBefore, cumulative.monthsAfter)) {
      parts.push(
        `${path} moves from ${show(cumulative.monthsBefore)} to ${show(cumulative.monthsAfter)}`,
      );
    }
    if (cumulative.clearedRules.length > 0) {
      parts.push(`clears ${cumulative.clearedRules.join(", ")} in month 0`);
    }
    return `Kept: ${parts.join("; ")}.`;
  }
  if (alone.addedRules.length > 0 || cumulative.addedRules.length > 0) {
    const added = [...new Set([...alone.addedRules, ...cumulative.addedRules])];
    return `Dropped: it makes ${added.join(", ")} fail in month 0.`;
  }
  if (!alone.improves) {
    return `Dropped: on its own it leaves ${path} at ${show(alone.monthsAfter)} and clears no rule.`;
  }
  return `Dropped: with the actions already kept it adds nothing (${path} stays at ${show(cumulative.monthsBefore)}).`;
}
