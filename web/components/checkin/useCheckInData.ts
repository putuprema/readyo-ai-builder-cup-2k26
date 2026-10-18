"use client";

import {
  type Analysis,
  firestorePaths,
  type Goal,
  type Holding,
  type Loan,
  type MonthRecord,
  type Transaction,
} from "@adidi/shared";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { firestore } from "@/lib/firebase";
import type { MonthRecords } from "./model";

// What the check-in reads (all owner reads under users/{uid}): the goals, live, so a goal
// that starts analysing drops out of the chips; each active goal's latest analysis for its
// headline; the submitted months; and last month's transactions, loans and holdings to say
// what each source contained.

export interface ActiveGoal {
  goal: Goal;
  analysis: Analysis | null;
}

export type CheckInData =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      goals: Goal[];
      active: ActiveGoal[];
      months: { month: string; record: MonthRecord }[];
    };

export function useCheckInData(uid: string | null): CheckInData {
  const [goals, setGoals] = useState<Goal[] | undefined>(undefined);
  const [analyses, setAnalyses] = useState<Record<string, Analysis | null>>({});
  const [months, setMonths] = useState<{ month: string; record: MonthRecord }[] | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(new Set<string>());

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      collection(firestore(), `${firestorePaths.user(uid)}/goals`),
      (snap) => setGoals(snap.docs.map((d) => ({ ...(d.data() as Goal), id: d.id }))),
      (err) => setError(err.message),
    );
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getDocs(collection(firestore(), `${firestorePaths.user(uid)}/months`))
      .then((snap) => {
        if (cancelled) return;
        setMonths(
          snap.docs
            .map((d) => ({ month: d.id, record: d.data() as MonthRecord }))
            .sort((a, b) => a.month.localeCompare(b.month)),
        );
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // One read per active goal's latest analysis, keyed by goal id and month so a new analysis
  // (after a run) is fetched again.
  const wanted = (goals ?? [])
    .filter((g) => g.status === "active")
    .map((g) => `${g.id}/${g.latestAnalysisMonth ?? ""}`)
    .join(",");
  useEffect(() => {
    if (!uid || !wanted) return;
    for (const key of wanted.split(",")) {
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      const [goalId, month] = key.split("/") as [string, string];
      if (!month) {
        setAnalyses((a) => ({ ...a, [key]: null }));
        continue;
      }
      getDoc(doc(firestore(), firestorePaths.analysis(uid, goalId, month)))
        .then((snap) =>
          setAnalyses((a) => ({ ...a, [key]: snap.exists() ? (snap.data() as Analysis) : null })),
        )
        .catch(() => setAnalyses((a) => ({ ...a, [key]: null })));
    }
  }, [uid, wanted]);

  if (error) return { status: "error", message: error };
  if (!goals || !months) return { status: "loading" };
  const activeGoals = goals.filter((g) => g.status === "active");
  const keys = activeGoals.map((g) => `${g.id}/${g.latestAnalysisMonth ?? ""}`);
  if (keys.some((k) => !(k in analyses))) return { status: "loading" };
  return {
    status: "ready",
    goals,
    active: activeGoals.map((goal, i) => ({ goal, analysis: analyses[keys[i] as string] ?? null })),
    months,
  };
}

/** Last month's records, to say what each source contained; empty lists until loaded. */
export function useMonthRecords(uid: string | null, month: string | null): MonthRecords | null {
  const [records, setRecords] = useState<MonthRecords | null>(null);
  useEffect(() => {
    if (!uid || !month) return;
    let cancelled = false;
    const base = firestorePaths.user(uid);
    const read = <T>(name: string) =>
      getDocs(query(collection(firestore(), `${base}/${name}`), where("month", "==", month))).then(
        (snap) => snap.docs.map((d) => d.data() as T),
      );
    Promise.all([read<Transaction>("transactions"), read<Loan>("loans"), read<Holding>("holdings")])
      .then(([transactions, loans, holdings]) => {
        if (!cancelled) setRecords({ transactions, loans, holdings });
      })
      .catch(() => !cancelled && setRecords({ transactions: [], loans: [], holdings: [] }));
    return () => {
      cancelled = true;
    };
  }, [uid, month]);
  return records;
}
