import {
  type ActionChoice,
  demoActions,
  demoGoal,
  demoProfile,
  demoRules,
  demoSnapshot,
  planWithChoices,
} from "@adidi/shared";
import type { ChoiceResult, ChoicesApi } from "./api";

// A stand-in for the choices endpoint while the page runs on the demo analysis: it runs the
// same planWithChoices() the api runs (shared/src/plan/choices.ts) over the demo data, so the
// plan line behaves exactly as it will against the server. Not used once task 5 wires the api.

export function mockChoicesApi(options: { delayMs?: number; failWith?: string } = {}): ChoicesApi {
  let choices: Record<string, ActionChoice> = { a1: "undecided", a2: "undecided", a3: "undecided" };
  return {
    async setChoice(_goalId, _month, actionId, choice) {
      await new Promise((r) => setTimeout(r, options.delayMs ?? 400));
      if (options.failWith) throw new Error(options.failWith);
      choices = { ...choices, [actionId]: choice };
      const plan = planWithChoices({
        snapshot: demoSnapshot,
        profile: demoProfile,
        goal: demoGoal,
        rules: demoRules,
        actions: demoActions,
        choices,
      });
      const result: ChoiceResult = {
        choices,
        monthsToReady: {
          cash: plan.result.cash.monthsToReady,
          ...(plan.result.loan ? { loan: plan.result.loan.monthsToReady } : {}),
        },
      };
      return result;
    },
  };
}
