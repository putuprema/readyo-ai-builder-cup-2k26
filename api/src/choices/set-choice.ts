import {
  type ActionChoice,
  type DismissedAction,
  dismissedActionsFrom,
  mergeDismissedActions,
  mergeRules,
  plainJson,
  planWithChoices,
  type SimulationResult,
  toDismissedAction,
} from "@adidi/shared";
import { ValidationError } from "../validate.js";
import type { AnalysisStore } from "./ports.js";

// PATCH /goals/:id/analyses/:month/choices (specs/06-agent.md "Choices", task 4; the api track's
// half of it). No model call: the plan line is simulate() with every non-dismissed action,
// stored on the analysis as `withChoices` so the UI reads "With your choices: approval in N
// months" from the server. Dismissed actions become preferences the agent reads on later runs;
// an undo takes the action out of the preferences again.

export interface SetChoiceDeps {
  store: AnalysisStore;
}

export interface ChoicePlan {
  leadingPath: "cash" | "loan";
  /** Months to ready with the user's choices, on each path; null = not within the horizon. */
  monthsToReady: { cash: number | null; loan?: number | null };
  /** The same months with every action, for the "(M with all three)" part of the line. */
  withAllActions: { cash: number | null; loan?: number | null };
  included: string[];
  skipped: string[];
  committed: string[];
}

export type SetChoiceOutcome =
  | { status: 200; body: { choices: Record<string, ActionChoice>; plan: ChoicePlan } }
  | { status: 404 | 409; body: { error: string; message: string } };

export async function setChoice(
  uid: string,
  goalId: string,
  month: string,
  body: { actionId: string; choice: ActionChoice },
  deps: SetChoiceDeps,
): Promise<SetChoiceOutcome> {
  const { store } = deps;
  const goal = await store.getGoal(uid, goalId);
  if (!goal) return notFound("Goal not found");
  if (goal.status === "analysing") {
    return {
      status: 409,
      body: {
        error: "conflict",
        message: "The goal is being analysed; try again when it finishes",
      },
    };
  }
  const analysis = await store.getAnalysis(uid, goalId, month);
  if (!analysis) return notFound(`No analysis for ${month}`);
  if (!analysis.actions.some((a) => a.id === body.actionId)) {
    throw new ValidationError([{ path: "actionId", message: "Unknown action for this analysis" }]);
  }
  const [user, monthRecord] = await Promise.all([store.getUser(uid), store.getMonth(uid, month)]);
  if (!user) return notFound("Profile not found");
  if (!monthRecord) return notFound(`No statements stored for ${month}`);

  const choices: Record<string, ActionChoice> = {
    ...analysis.choices,
    [body.actionId]: body.choice,
  };
  const [rules, overrides] = await Promise.all([store.listRules(), store.listOverrides(uid)]);
  const { preferences, ...profile } = user;
  const plan = planWithChoices({
    snapshot: monthRecord.snapshot,
    profile,
    goal,
    rules: mergeRules(rules, overrides),
    actions: analysis.actions,
    choices,
  });
  await store.updateAnalysis(uid, goalId, month, {
    choices,
    withChoices: plainJson(plan.result),
  });

  // Preferences: this analysis's dismissed actions are added; an action no longer dismissed here
  // is removed, so the agent may propose it again.
  const existing = preferences?.dismissedActions ?? [];
  const undone = new Set(
    analysis.actions
      .filter((a) => choices[a.id] !== "dismissed")
      .map((a) => key(toDismissedAction(a.change))),
  );
  const kept = existing.filter((d) => !undone.has(key(d)));
  const merged = mergeDismissedActions(kept, dismissedActionsFrom(analysis.actions, choices));
  if (!sameDismissed(existing, merged)) await store.setDismissedActions(uid, merged);

  const leadingPath: "cash" | "loan" =
    goal.type === "wedding" || goal.payPreference === "cash" ? "cash" : "loan";
  return {
    status: 200,
    body: {
      choices,
      plan: {
        leadingPath,
        monthsToReady: monthsOf(plan.result),
        withAllActions: monthsOf(analysis.withPlan),
        included: plan.included,
        skipped: plan.skipped,
        committed: plan.committed,
      },
    },
  };
}

function monthsOf(result: SimulationResult): ChoicePlan["monthsToReady"] {
  return {
    cash: result.cash.monthsToReady,
    ...(result.loan ? { loan: result.loan.monthsToReady } : {}),
  };
}

function key(d: DismissedAction): string {
  return `${d.type}|${d.loanId ?? ""}|${d.category ?? ""}`;
}

function sameDismissed(a: DismissedAction[], b: DismissedAction[]): boolean {
  return a.length === b.length && a.every((d, i) => key(d) === key(b[i] as DismissedAction));
}

function notFound(message: string): SetChoiceOutcome {
  return { status: 404, body: { error: "not_found", message } };
}
