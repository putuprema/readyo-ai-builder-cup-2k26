import type { ActionChoice } from "@adidi/shared";

// What the plan section needs from PATCH /goals/:id/analyses/:month/choices
// (specs/06-agent.md "Choices"; api/src/choices/set-choice.ts). The months come from the
// server: the browser never recomputes the plan line.

export interface ChoiceResult {
  choices: Record<string, ActionChoice>;
  /** Months to ready on each path with the choices applied; null = not within the horizon. */
  monthsToReady: { cash: number | null; loan?: number | null };
}

export interface ChoicesApi {
  setChoice(
    goalId: string,
    month: string,
    actionId: string,
    choice: ActionChoice,
  ): Promise<ChoiceResult>;
}
