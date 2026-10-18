"use client";

import { useGoalId } from "../goal-id";
import { ProgressView } from "./ProgressView";
import { useFakeRun } from "./useFakeRun";

// The /goals/[id]/progress route. Task 1 drives the view with a fake run; task 5 replaces
// useFakeRun with the Firestore listener on users/{uid}/runs/{runId}.
export function ProgressScreen() {
  const goalId = useGoalId();
  const run = useFakeRun(goalId);
  const base = goalId ? `/goals/${encodeURIComponent(goalId)}` : "/goals";
  return (
    <ProgressView
      run={run}
      goalsHref="/goals/"
      resultHref={`${base}/result/`}
      documentsHref={`${base}/documents/`}
    />
  );
}
