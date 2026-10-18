"use client";

import { demoAnalysis, demoGoal } from "@adidi/shared";
import { useMemo } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { mockChoicesApi } from "./choices/mock-api";
import { useChoices } from "./choices/useChoices";
import { useGoalId } from "./goal-id";
import { ResultPage } from "./ResultPage";

// The /goals/[id]/result route. Until task 5 wires the Firestore listeners, every goal id
// shows the shared demo analysis.
export function ResultScreen() {
  const goalId = useGoalId();
  const api = useMemo(() => mockChoicesApi(), []);
  const choices = useChoices(goalId ?? demoGoal.id, demoAnalysis, api);
  return (
    <>
      <div className="print:hidden">
        <SiteHeader />
      </div>
      <ResultPage
        goal={goalId ? { ...demoGoal, id: goalId } : demoGoal}
        analysis={demoAnalysis}
        choices={choices}
        documentsHref="/documents/"
        assumptionsHref="/assumptions/"
      />
    </>
  );
}
