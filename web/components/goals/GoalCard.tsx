"use client";

import type { Goal } from "@adidi/shared";
import { goalSummary } from "@/lib/goal-summary";
import { GOAL_TITLE } from "./list";

export function GoalCard({ goal }: { goal: Goal }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface px-6 py-[22px]">
      <h2 className="m-0 font-bold text-[18px]">{GOAL_TITLE[goal.type]}</h2>
      <span className="text-[14px] text-muted">
        {goalSummary(goal)} · {goal.status}
      </span>
    </li>
  );
}
