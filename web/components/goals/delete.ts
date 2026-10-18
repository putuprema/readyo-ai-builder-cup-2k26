import type { Goal } from "@adidi/shared";
import { goalPlace } from "./cards";
import { GOAL_TITLE } from "./list";

// Delete rules of the goals list (specs/12-ui-goals-list.md): a draft goes at once, an active
// goal asks first (it carries tracked history), an analysing goal has no delete control.

export type DeleteMode = "none" | "immediate" | "confirm";

export function deleteMode(goal: Pick<Goal, "status">): DeleteMode {
  switch (goal.status) {
    case "analysing":
      return "none";
    case "draft":
      return "immediate";
    case "active":
      return "confirm";
  }
}

export const CONFIRM_COPY = {
  title: "Delete this goal?",
  body: "This removes the goal and its tracked history. Your statements stay for your other goals.",
  confirm: "Delete goal",
  cancel: "Keep it",
};

/** "Delete draft: Buy a house, Bandung" for the icon button's accessible name. */
export function deleteLabel(goal: Goal): string {
  const what = goal.status === "draft" ? "draft" : "goal";
  return `Delete ${what}: ${goalName(goal)}`;
}

/** "Buy a house, Bandung". */
export function goalName(goal: Goal): string {
  return `${GOAL_TITLE[goal.type]}, ${goalPlace(goal)}`;
}

/** What a failed delete tells the person, by the api's error code. */
export function deleteErrorMessage(code: string): string {
  switch (code) {
    case "goal_analysing":
      return "This goal is being analysed. You can delete it once the analysis finishes.";
    case "not_found":
      return "This goal was already deleted.";
    case "network":
      return "Could not reach the server. Check your connection and try again.";
    default:
      return "The goal could not be deleted. Try again in a moment.";
  }
}
