"use client";

import { useEffect, useState } from "react";
import { goalSummary } from "@/lib/goal-summary";
import { firebaseConfigured } from "../firebase";
import { useGoalId } from "../goal-id";
import { useGoalAnalysis } from "../useGoalAnalysis";
import { useUser } from "../useUser";
import { ProgressView } from "./ProgressView";
import { useFakeRun } from "./useFakeRun";
import { runIdFromSearch, useRun } from "./useRun";

// The /goals/[id]/progress route: the run document from Firestore (?run=<id> from Submit,
// else the goal's latest run). Without a Firebase project configured, a fake run walks
// through the stages so the view can be reviewed from a plain `pnpm dev`.

export function ProgressScreen() {
  const goalId = useGoalId();
  const base = goalId ? `/goals/${encodeURIComponent(goalId)}` : "/goals";
  const hrefs = {
    goalsHref: "/goals/",
    resultHref: `${base}/result/`,
    documentsHref: `${base}/documents/`,
  };
  return firebaseConfigured ? (
    <LiveProgress goalId={goalId} {...hrefs} />
  ) : (
    <FakeProgress goalId={goalId} {...hrefs} />
  );
}

type Hrefs = { goalsHref: string; resultHref: string; documentsHref: string };

function FakeProgress({ goalId, ...hrefs }: { goalId: string | null } & Hrefs) {
  const run = useFakeRun(goalId);
  return <ProgressView run={run} {...hrefs} />;
}

function LiveProgress({ goalId, ...hrefs }: { goalId: string | null } & Hrefs) {
  const user = useUser();
  const uid = user.status === "signed_in" ? user.user.uid : null;
  const [runId, setRunId] = useState<string | null>(null);
  useEffect(() => setRunId(runIdFromSearch(window.location.search)), []);
  const runState = useRun(uid, goalId, runId);
  const goal = useGoalAnalysis(uid, goalId);
  const label =
    goal.status === "ready" || goal.status === "no_analysis" ? goalSummary(goal.goal) : undefined;

  if (user.status === "signed_out") {
    return <ProgressView run={null} goalLabel="Sign in to follow this analysis" {...hrefs} />;
  }
  if (runState.status === "error") {
    return (
      <ProgressView
        run={{
          id: "error",
          stage: "failed",
          percent: 0,
          startedAt: "",
          goalIds: [],
          month: "",
          kind: "first",
          error: `Could not read the run: ${runState.message}`,
        }}
        goalLabel={label}
        {...hrefs}
      />
    );
  }
  // "none" (no run yet for this goal) shows the waiting state like "loading" does.
  return (
    <ProgressView
      run={runState.status === "ready" ? runState.run : null}
      goalLabel={label}
      {...hrefs}
    />
  );
}
