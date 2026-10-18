import type { ActionCard, ActionChoice, Analysis, Goal } from "@adidi/shared";
import { monthsText } from "./format";
import { type LeadingPath, leadingPath, loanProduct } from "./model";

// The line under the plan title (docs/analysis.md "Action choices"; design artboard
// Analysis). Before any choice: what the whole plan does. After one: the server's months
// with the choices applied, never a figure computed here.

export interface PlanLineInput {
  goal: Goal;
  analysis: Analysis;
  choices: Record<string, ActionChoice>;
  /** Months with the choices applied, as the server reported them (null until it has). */
  monthsWithChoices: { cash: number | null; loan?: number | null } | null;
}

export function anyChoiceMade(
  actions: ActionCard[],
  choices: Record<string, ActionChoice>,
): boolean {
  return actions.some((a) => (choices[a.id] ?? "undecided") !== "undecided");
}

function monthsOn(
  result: { cash: { monthsToReady: number | null }; loan?: { monthsToReady: number | null } },
  path: LeadingPath,
): number | null {
  return path === "loan" ? (result.loan?.monthsToReady ?? null) : result.cash.monthsToReady;
}

/** "approval" for a loan path, "being ready" for the cash path. */
export function readyWord(goal: Goal): string {
  return leadingPath(goal) === "loan" ? `${loanProduct(goal)} approval` : "being ready";
}

export function planLine(input: PlanLineInput): string {
  const { goal, analysis, choices } = input;
  const path = leadingPath(goal);
  const actions = analysis.actions;
  const withAll = monthsOn(analysis.withPlan, path);
  const word = readyWord(goal);

  if (actions.length === 0)
    return "No action moved your date; the simulator found nothing to change.";

  if (!anyChoiceMade(actions, choices)) {
    const without = monthsOn(analysis.withoutPlan, path);
    const together = actions.length === 1 ? "It moves" : "Together they move";
    return `${together} ${word} from ${monthsText(without)} to ${monthsText(withAll)}. Order matters.`;
  }

  const committed = actions.filter((a) => choices[a.id] === "committed").length;
  const skipped = actions.filter((a) => choices[a.id] === "dismissed").length;
  const months =
    input.monthsWithChoices === null
      ? null
      : path === "loan"
        ? (input.monthsWithChoices.loan ?? null)
        : input.monthsWithChoices.cash;
  const inMonths = input.monthsWithChoices === null ? "being recalculated" : inText(months);
  const all =
    actions.length === 1 ? "with it" : `with all ${COUNT_WORDS[actions.length] ?? actions.length}`;
  const label = path === "loan" ? "approval" : "ready";
  return `With your choices: ${label} ${inMonths} (${monthsText(withAll)} ${all}) · ${committed} in your plan, ${skipped} skipped.`;
}

const COUNT_WORDS: Record<number, string> = { 2: "two", 3: "three" };

/** "in 14 months", "this month", "not within 30 years". */
function inText(months: number | null): string {
  if (months === null || months === 0) return monthsText(months);
  return `in ${monthsText(months)}`;
}

/** The skipped card's loss line, from the action's own monthsSaved. */
export function skippedLine(action: ActionCard, goal: Goal): string {
  const word = leadingPath(goal) === "loan" ? "approval" : "being ready";
  if (action.monthsSaved > 0 && action.monthsSaved <= 360) {
    return `Without it, ${word} moves back ${action.monthsSaved} ${action.monthsSaved === 1 ? "month" : "months"}.`;
  }
  return `Without it: ${action.impactLine.charAt(0).toLowerCase()}${action.impactLine.slice(1)} is lost.`;
}
