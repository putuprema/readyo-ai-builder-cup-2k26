import type { ActionChoice } from "@adidi/shared";
import type { User } from "firebase/auth";
import type { ChoiceResult, ChoicesApi } from "./api";

// PATCH /goals/:id/analyses/:month/choices with the Firebase ID token
// (specs/01-contracts.md "API"; api/src/choices/set-choice.ts). The response's plan months
// are the server's; the analysis listener then brings the stored choices and withChoices.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

interface ChoiceResponse {
  choices: Record<string, ActionChoice>;
  plan: { monthsToReady: { cash: number | null; loan?: number | null } };
}

export function apiChoices(user: User): ChoicesApi {
  return {
    async setChoice(goalId, month, actionId, choice) {
      const token = await user.getIdToken();
      const res = await fetch(
        `${API_URL}/goals/${encodeURIComponent(goalId)}/analyses/${encodeURIComponent(month)}/choices`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ actionId, choice }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as ChoiceResponse;
      const result: ChoiceResult = {
        choices: body.choices,
        monthsToReady: body.plan.monthsToReady,
      };
      return result;
    },
  };
}
