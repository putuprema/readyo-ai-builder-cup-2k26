"use client";

import { demoAnalysis, demoGoal } from "@adidi/shared";
import { SiteHeader } from "@/components/SiteHeader";
import { useGoalId } from "./goal-id";
import { ResultPage } from "./ResultPage";

// The /goals/[id]/result route. Until task 5 wires the Firestore listeners, every goal id
// shows the shared demo analysis.
export function ResultScreen() {
  const goalId = useGoalId();
  return (
    <>
      <div className="print:hidden">
        <SiteHeader />
      </div>
      <ResultPage
        goal={goalId ? { ...demoGoal, id: goalId } : demoGoal}
        analysis={demoAnalysis}
        documentsHref="/documents/"
        assumptionsHref="/assumptions/"
      />
    </>
  );
}
