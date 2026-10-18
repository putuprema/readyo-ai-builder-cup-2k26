"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { useUser } from "@/lib/auth";
import { GoalCard } from "./GoalCard";
import {
  countsSubtitle,
  filterCount,
  filterGoals,
  type GoalFilter,
  goalCounts,
  orderGoals,
} from "./list";
import { useNow } from "./live";
import { useGoals } from "./useGoals";

// 4 · Goals list (docs/screens.md): every goal, analysing first, then drafts, then active.

const FILTERS: { id: GoalFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "drafts", label: "Drafts" },
];

export function GoalsPage() {
  return (
    <>
      <SiteHeader active="goals" />
      <RequireAuth>
        <GoalsList />
      </RequireAuth>
    </>
  );
}

function GoalsList() {
  const user = useUser();
  const state = useGoals(user?.uid ?? null);
  const [filter, setFilter] = useState<GoalFilter>("all");
  const now = useNow();
  const uid = user?.uid ?? "";

  const ordered = useMemo(() => (state.status === "ready" ? orderGoals(state.goals) : []), [state]);
  const counts = goalCounts(ordered);
  const shown = filterGoals(ordered, filter);

  if (state.status === "loading") {
    return (
      <Main>
        <h1 className={TITLE}>Your goals</h1>
        <p className="m-0 text-muted" aria-busy="true">
          Loading your goals
        </p>
      </Main>
    );
  }
  if (state.status === "error") {
    return (
      <Main>
        <h1 className={TITLE}>Your goals</h1>
        <p role="alert" className="m-0 text-blocked">
          Your goals could not be loaded. Reload the page to try again.
        </p>
      </Main>
    );
  }

  return (
    <Main>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className={TITLE}>Your goals</h1>
          <p className="m-0 text-muted">{countsSubtitle(counts)}</p>
        </div>
        <Link
          href="/goals/new/?type=house"
          className="inline-flex min-h-12 items-center gap-2.5 rounded-xl bg-accent px-[22px] font-bold text-[15px] text-white no-underline hover:bg-accent-strong"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          New goal
        </Link>
      </div>

      <fieldset className="m-0 flex min-w-0 gap-1 self-start rounded-xl border-0 bg-[#E9ECE7] p-1">
        <legend className="sr-only">Filter goals</legend>
        {FILTERS.map((f) => {
          const selected = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setFilter(f.id)}
              className={`min-h-11 cursor-pointer rounded-[9px] border-0 px-4 text-[14px] ${
                selected
                  ? "bg-surface font-bold text-ink"
                  : "bg-transparent font-semibold text-muted"
              }`}
            >
              {f.label}{" "}
              <span className="font-semibold text-muted">{filterCount(counts, f.id)}</span>
            </button>
          );
        })}
      </fieldset>

      {shown.length === 0 ? (
        <p className="m-0 text-muted">
          {filter === "active" ? "No active goals yet." : "No drafts to finish."}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
          {shown.map((goal) => (
            <GoalCard key={goal.id} goal={goal} uid={uid} now={now} />
          ))}
        </ul>
      )}
    </Main>
  );
}

const TITLE = "m-0 font-extrabold text-[34px] leading-[1.15] tracking-[-0.02em]";

function Main({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto box-border flex w-full max-w-[1120px] flex-col gap-7 px-4 pt-10 pb-16 sm:px-8">
      {children}
    </main>
  );
}
