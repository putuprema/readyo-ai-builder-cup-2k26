"use client";

import type { ActionChoice, Analysis } from "@adidi/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChoicesApi } from "./api";

// Choice state for the plan section: optimistic update, rollback on error, and the months
// with the choices applied as the server reports them. The analysis document (Firestore
// listener, or the demo) is the source of truth; local state only bridges the round trip.

export interface ChoicesState {
  choices: Record<string, ActionChoice>;
  /** Months to ready on the leading path with the choices applied, once the server answered. */
  monthsWithChoices: { cash: number | null; loan?: number | null } | null;
  pendingActionId: string | null;
  error: string | null;
  setChoice(actionId: string, choice: ActionChoice): void;
}

export function useChoices(goalId: string, analysis: Analysis, api: ChoicesApi): ChoicesState {
  const [choices, setChoices] = useState(analysis.choices);
  const [months, setMonths] = useState<ChoicesState["monthsWithChoices"]>(() => monthsOf(analysis));
  const [pendingActionId, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(0);

  // A new analysis document (listener update, another month) resets the local state.
  useEffect(() => {
    if (inFlight.current > 0) return;
    setChoices(analysis.choices);
    setMonths(monthsOf(analysis));
  }, [analysis]);

  const setChoice = useCallback(
    (actionId: string, choice: ActionChoice) => {
      const previous = choices;
      setChoices({ ...previous, [actionId]: choice });
      setPending(actionId);
      setError(null);
      inFlight.current += 1;
      api
        .setChoice(goalId, analysis.month, actionId, choice)
        .then((result) => {
          setChoices(result.choices);
          setMonths(result.monthsToReady);
        })
        .catch((err: unknown) => {
          setChoices(previous);
          setError(
            err instanceof Error && err.message
              ? `Could not save that choice (${err.message}). Please try again.`
              : "Could not save that choice. Please try again.",
          );
        })
        .finally(() => {
          inFlight.current -= 1;
          setPending(null);
        });
    },
    [analysis.month, api, choices, goalId],
  );

  return { choices, monthsWithChoices: months, pendingActionId, error, setChoice };
}

function monthsOf(analysis: Analysis): ChoicesState["monthsWithChoices"] {
  const r = analysis.withChoices;
  if (!r) return null;
  return { cash: r.cash.monthsToReady, ...(r.loan ? { loan: r.loan.monthsToReady } : {}) };
}
