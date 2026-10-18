"use client";

import { firestorePaths, type RunStatus } from "@adidi/shared";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { firestoreDb } from "../firebase";

// The run document the progress view follows: users/{uid}/runs/{runId} when Submit passed
// ?run=<id> (specs/10-ui-goal-creation.md), else the latest run that includes the goal.

export type RunState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "ready"; run: RunStatus }
  | { status: "error"; message: string };

export function runIdFromSearch(search: string): string | null {
  return new URLSearchParams(search).get("run");
}

export function useRun(uid: string | null, goalId: string | null, runId: string | null): RunState {
  const [state, setState] = useState<RunState>({ status: "loading" });

  useEffect(() => {
    if (!uid || !goalId) return;
    const db = firestoreDb();
    const toRun = (id: string, data: object): RunStatus => ({ ...(data as RunStatus), id });
    if (runId) {
      return onSnapshot(
        doc(db, firestorePaths.run(uid, runId)),
        (snap) =>
          setState(
            snap.exists()
              ? { status: "ready", run: toRun(snap.id, snap.data()) }
              : { status: "none" },
          ),
        (err) => setState({ status: "error", message: err.message }),
      );
    }
    const runs = query(
      collection(db, `${firestorePaths.user(uid)}/runs`),
      where("goalIds", "array-contains", goalId),
    );
    return onSnapshot(
      runs,
      (snap) => {
        let latest: RunStatus | null = null;
        for (const d of snap.docs) {
          const run = toRun(d.id, d.data());
          if (!latest || run.startedAt > latest.startedAt) latest = run;
        }
        setState(latest ? { status: "ready", run: latest } : { status: "none" });
      },
      (err) => setState({ status: "error", message: err.message }),
    );
  }, [uid, goalId, runId]);

  return state;
}
