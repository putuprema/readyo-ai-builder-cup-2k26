"use client";

import { firestorePaths, type Goal } from "@adidi/shared";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { firestore } from "@/lib/firebase";

// Live users/{uid}/goals. Also used by the Documents tab (spec 13) to choose between the
// monthly check-in and the "Start with a goal" state (NoGoals in CheckInPage).

export type GoalsState =
  | { status: "loading" }
  | { status: "ready"; goals: Goal[] }
  | { status: "error"; message: string };

export function useGoals(uid: string | null): GoalsState {
  const [state, setState] = useState<GoalsState>({ status: "loading" });

  useEffect(() => {
    setState({ status: "loading" });
    if (!uid) return;
    return onSnapshot(
      collection(firestore(), `${firestorePaths.user(uid)}/goals`),
      (snap) =>
        setState({
          status: "ready",
          goals: snap.docs.map((d) => ({ ...(d.data() as Goal), id: d.id })),
        }),
      (error) => setState({ status: "error", message: error.message }),
    );
  }, [uid]);

  return state;
}
