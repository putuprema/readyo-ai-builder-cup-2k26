"use client";

import { type Analysis, firestorePaths, type Goal } from "@adidi/shared";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { firestoreDb } from "./firebase";

// Live goal and latest analysis for the result page: users/{uid}/goals/{id}, then
// users/{uid}/goals/{id}/analyses/{goal.latestAnalysisMonth}. The listeners keep the page in
// step with the pipeline and with PATCH .../choices (which writes choices and withChoices).

export type GoalAnalysisState =
  | { status: "loading" }
  | { status: "no_goal" }
  | { status: "no_analysis"; goal: Goal }
  | { status: "ready"; goal: Goal; analysis: Analysis }
  | { status: "error"; message: string };

export function useGoalAnalysis(uid: string | null, goalId: string | null): GoalAnalysisState {
  const [goal, setGoal] = useState<Goal | null | undefined>(undefined);
  const [analysis, setAnalysis] = useState<Analysis | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !goalId) return;
    setGoal(undefined);
    return onSnapshot(
      doc(firestoreDb(), firestorePaths.goal(uid, goalId)),
      (snap) =>
        setGoal(snap.exists() ? ({ ...(snap.data() as object), id: snap.id } as Goal) : null),
      (err) => setError(err.message),
    );
  }, [uid, goalId]);

  const month = goal?.latestAnalysisMonth;
  useEffect(() => {
    if (!uid || !goalId) return;
    if (!month) {
      setAnalysis(null);
      return;
    }
    setAnalysis(undefined);
    return onSnapshot(
      doc(firestoreDb(), firestorePaths.analysis(uid, goalId, month)),
      (snap) => setAnalysis(snap.exists() ? (snap.data() as Analysis) : null),
      (err) => setError(err.message),
    );
  }, [uid, goalId, month]);

  if (error) return { status: "error", message: error };
  if (goal === undefined) return { status: "loading" };
  if (goal === null) return { status: "no_goal" };
  if (analysis === undefined) return { status: "loading" };
  if (analysis === null) return { status: "no_analysis", goal };
  return { status: "ready", goal, analysis };
}
