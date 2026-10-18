import type { Rules } from "../rules.js";
import { simulate } from "../simulate/simulate.js";
import type {
  ActionCard,
  ActionChoice,
  DismissedAction,
  Goal,
  Profile,
  SimulationResult,
  Snapshot,
} from "../types.js";

// Action choices (specs/06-agent.md, "Choices"; docs/analysis.md, "Action choices"). No model
// call: the plan line is simulate() with every non-dismissed action, and dismissed actions
// become preferences the agent reads on later runs. Pure, so the api route only loads and
// stores documents around these.

export interface PlanWithChoicesInput {
  snapshot: Snapshot;
  profile: Profile;
  goal: Goal;
  rules: Rules;
  actions: ActionCard[];
  choices: Record<string, ActionChoice>;
  maxMonths?: number;
}

export interface PlanWithChoices {
  /** simulate() with every action that is not dismissed (undecided counts as taken). */
  result: SimulationResult;
  /** Ids of the actions in the plan, in card order. */
  included: string[];
  /** Ids of the dismissed actions, in card order. */
  skipped: string[];
  /** Ids the user committed to ("I'll do this"). */
  committed: string[];
}

/** The plan line after the user's choices: all non-dismissed actions applied together. */
export function planWithChoices(input: PlanWithChoicesInput): PlanWithChoices {
  const included: string[] = [];
  const skipped: string[] = [];
  const committed: string[] = [];
  for (const action of input.actions) {
    const choice = input.choices[action.id] ?? "undecided";
    if (choice === "dismissed") skipped.push(action.id);
    else included.push(action.id);
    if (choice === "committed") committed.push(action.id);
  }
  const changes = input.actions.filter((a) => included.includes(a.id)).map((a) => a.change);
  const result = simulate({
    snapshot: input.snapshot,
    profile: input.profile,
    goal: input.goal,
    rules: input.rules,
    changes,
    ...(input.maxMonths === undefined ? {} : { maxMonths: input.maxMonths }),
  });
  return { result, included, skipped, committed };
}

/** The dismissed actions of an analysis as preferences: type plus the loan or category. */
export function dismissedActionsFrom(
  actions: ActionCard[],
  choices: Record<string, ActionChoice>,
): DismissedAction[] {
  return actions
    .filter((a) => choices[a.id] === "dismissed")
    .map((a) => toDismissedAction(a.change));
}

export function toDismissedAction(change: ActionCard["change"]): DismissedAction {
  switch (change.type) {
    case "refinance_loan":
    case "pay_off_loan":
      return { type: change.type, loanId: change.loanId };
    case "cap_spending":
      return { type: change.type, category: change.category };
    case "move_assets":
      return { type: change.type };
  }
}

/** Merge newly dismissed actions into the stored list without duplicates. */
export function mergeDismissedActions(
  existing: DismissedAction[],
  added: DismissedAction[],
): DismissedAction[] {
  const key = (d: DismissedAction) => `${d.type}|${d.loanId ?? ""}|${d.category ?? ""}`;
  const seen = new Set(existing.map(key));
  const merged = [...existing];
  for (const d of added) {
    if (seen.has(key(d))) continue;
    seen.add(key(d));
    merged.push(d);
  }
  return merged;
}
