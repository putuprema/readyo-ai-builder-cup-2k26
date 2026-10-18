"use client";

import { demoAnalysis, demoGoal } from "@adidi/shared";
import { useMemo } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import type { ChoicesApi } from "./choices/api";
import { apiChoices } from "./choices/api-client";
import { mockChoicesApi } from "./choices/mock-api";
import { useChoices } from "./choices/useChoices";
import { firebaseConfigured } from "./firebase";
import { useGoalId } from "./goal-id";
import { Notice } from "./Notice";
import { ResultPage } from "./ResultPage";
import { useGoalAnalysis } from "./useGoalAnalysis";
import { useUser } from "./useUser";

// The /goals/[id]/result route: the signed-in user's goal and its latest analysis from the
// Firestore listeners, choices through the api. Without a Firebase project configured (no
// NEXT_PUBLIC_FIREBASE_PROJECT_ID and no emulators) the page shows the shared demo analysis
// with a mock choices api, so the design can be reviewed from a plain `pnpm dev`.

export function ResultScreen() {
  const goalId = useGoalId();
  return (
    <>
      <div className="print:hidden">
        <SiteHeader />
      </div>
      {firebaseConfigured ? <LiveResult goalId={goalId} /> : <DemoResult goalId={goalId} />}
    </>
  );
}

const HREFS = { documentsHref: "/documents/", assumptionsHref: "/assumptions/" };

function DemoResult({ goalId }: { goalId: string | null }) {
  const api = useMemo(() => mockChoicesApi(), []);
  const goal = goalId ? { ...demoGoal, id: goalId } : demoGoal;
  return <ConnectedResult goal={goal} analysis={demoAnalysis} api={api} />;
}

function LiveResult({ goalId }: { goalId: string | null }) {
  const user = useUser();
  const uid = user.status === "signed_in" ? user.user.uid : null;
  const data = useGoalAnalysis(uid, goalId);
  const api = useMemo(() => (user.status === "signed_in" ? apiChoices(user.user) : null), [user]);

  if (user.status === "signed_out") {
    return (
      <Notice title="Sign in to see your readiness">
        <a href="/" className="font-semibold text-accent-strong no-underline">
          Go to the start page
        </a>
      </Notice>
    );
  }
  if (!goalId) return <Notice title="This link has no goal in it" />;
  if (user.status === "loading" || data.status === "loading" || !api) {
    return <Notice title="Loading your readiness" muted />;
  }
  if (data.status === "error")
    return <Notice title="Could not load this goal">{data.message}</Notice>;
  if (data.status === "no_goal") {
    return (
      <Notice title="We could not find this goal">
        <a href="/goals/" className="font-semibold text-accent-strong no-underline">
          Back to your goals
        </a>
      </Notice>
    );
  }
  if (data.status === "no_analysis") {
    const analysing = data.goal.status === "analysing";
    return (
      <Notice title={analysing ? "This goal is being analysed" : "No analysis yet for this goal"}>
        <a
          href={analysing ? `/goals/${encodeURIComponent(goalId)}/progress/` : HREFS.documentsHref}
          className="font-semibold text-accent-strong no-underline"
        >
          {analysing ? "Follow the progress" : "Upload your statements"}
        </a>
      </Notice>
    );
  }
  return <ConnectedResult goal={data.goal} analysis={data.analysis} api={api} />;
}

function ConnectedResult({
  goal,
  analysis,
  api,
}: {
  goal: Parameters<typeof ResultPage>[0]["goal"];
  analysis: Parameters<typeof ResultPage>[0]["analysis"];
  api: ChoicesApi;
}) {
  const choices = useChoices(goal.id, analysis, api);
  return <ResultPage goal={goal} analysis={analysis} choices={choices} {...HREFS} />;
}
