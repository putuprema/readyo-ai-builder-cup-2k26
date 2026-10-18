"use client";

import { type Analysis, firestorePaths, type RunStatus } from "@adidi/shared";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { firestore } from "@/lib/firebase";

// Live reads behind the cards: the analysing goal's latest run (the same document the
// progress view follows) and the active goal's latest analysis.

export function useLatestRun(uid: string | null, goalId: string): RunStatus | null {
  const [run, setRun] = useState<RunStatus | null>(null);
  useEffect(() => {
    if (!uid) return;
    const runs = query(
      collection(firestore(), `${firestorePaths.user(uid)}/runs`),
      where("goalIds", "array-contains", goalId),
    );
    return onSnapshot(
      runs,
      (snap) => {
        let latest: RunStatus | null = null;
        for (const d of snap.docs) {
          const r = { ...(d.data() as RunStatus), id: d.id };
          if (!latest || r.startedAt > latest.startedAt) latest = r;
        }
        setRun(latest);
      },
      () => setRun(null),
    );
  }, [uid, goalId]);
  return run;
}

export type AnalysisState =
  | { status: "loading" }
  | { status: "ready"; analysis: Analysis }
  | { status: "missing" };

export function useAnalysis(
  uid: string | null,
  goalId: string,
  month: string | undefined,
): AnalysisState {
  const [state, setState] = useState<AnalysisState>({ status: "loading" });
  useEffect(() => {
    if (!uid || !month) {
      setState({ status: "missing" });
      return;
    }
    return onSnapshot(
      doc(firestore(), firestorePaths.analysis(uid, goalId, month)),
      (snap) =>
        setState(
          snap.exists()
            ? { status: "ready", analysis: snap.data() as Analysis }
            : { status: "missing" },
        ),
      () => setState({ status: "missing" }),
    );
  }, [uid, goalId, month]);
  return state;
}

/** The current time, refreshed every `intervalMs`, for "Saved 5 min ago". */
export function useNow(intervalMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
