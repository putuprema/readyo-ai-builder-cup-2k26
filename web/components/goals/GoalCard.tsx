"use client";

import type { Goal } from "@adidi/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { activeModel, analysingModel, cardSummary, draftModel, type SegmentState } from "./cards";
import { GoalIcon } from "./GoalIcon";
import styles from "./goals.module.css";
import { GOAL_TITLE, timeAgo } from "./list";
import { useAnalysis, useLatestRun } from "./live";

// The three card variants of the goals list (docs/screens.md "4", design artboard Goals).

export interface GoalCardProps {
  goal: Goal;
  uid: string;
  now: Date;
  /** The delete control, rendered by the list (drafts and active goals only). */
  deleteControl?: ReactNode;
}

export function GoalCard(props: GoalCardProps) {
  switch (props.goal.status) {
    case "analysing":
      return <AnalysingCard {...props} />;
    case "draft":
      return <DraftCard {...props} />;
    case "active":
      return <ActiveCard {...props} />;
  }
}

function AnalysingCard({ goal, uid, now }: GoalCardProps) {
  const run = useLatestRun(uid, goal.id);
  const model = analysingModel(run);
  const submitted = run?.startedAt ?? goal.updatedAt;
  return (
    <li
      aria-busy="true"
      className="flex flex-wrap items-center gap-6 rounded-2xl border-2 border-accent bg-surface px-6 py-[22px] shadow-[0_0_0_4px_rgba(31,122,77,0.08)]"
    >
      <IconTile goal={goal} tone="accent" />
      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1.5">
        <TitleRow goal={goal}>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-[3px] font-bold text-[12px] text-white">
            <span className={`size-1.5 rounded-full bg-white ${styles.dot}`} />
            Analysing
          </span>
        </TitleRow>
        <span className="text-[14px] text-muted">{cardSummary(goal)}</span>
        <span className="text-[13px] text-muted">
          Submitted {timeAgo(submitted, now)} · you can leave this page
        </span>
      </div>
      <div className="flex min-w-[200px] flex-col gap-2" aria-live="polite">
        <span className="font-semibold text-[12px] text-accent-strong">{model.stage}</span>
        <span
          role="progressbar"
          aria-label="Analysis progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={model.percent}
          className="block h-2 w-[200px] overflow-hidden rounded-full bg-line"
        >
          <span
            className={`block h-full rounded-full bg-accent ${styles.bar}`}
            style={{ width: `${model.percent}%` }}
          />
        </span>
      </div>
      <Link href={`/goals/${goal.id}/progress/`} className={SECONDARY_BUTTON}>
        Watch progress
        <Arrow />
      </Link>
    </li>
  );
}

const SEGMENT_CLASS: Record<SegmentState, string> = {
  done: "bg-accent",
  current: "bg-[#9BB5A6]",
  todo: "bg-[#C9CFC9]",
};

function DraftCard({ goal, now, deleteControl }: GoalCardProps) {
  const model = draftModel(goal);
  return (
    <li className="flex flex-wrap items-center gap-6 rounded-2xl border-[1.5px] border-[#C9CFC9] border-dashed bg-[#FAFBF9] px-6 py-[22px]">
      <IconTile goal={goal} tone="muted" />
      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1.5">
        <TitleRow goal={goal}>
          <span className="rounded-full bg-[#E9ECE7] px-2.5 py-[3px] font-bold text-[12px] text-muted">
            Draft
          </span>
        </TitleRow>
        <span className="text-[14px] text-muted">{cardSummary(goal)}</span>
        <span className="text-[13px] text-muted">Saved {timeAgo(goal.updatedAt, now)}</span>
      </div>
      <div className="flex min-w-[150px] flex-col gap-2">
        <span className="font-semibold text-[12px] text-muted">{model.next}</span>
        <span
          role="img"
          aria-label={`Step ${model.step} of 3`}
          className="grid w-[150px] grid-cols-3 gap-1"
        >
          {model.segments.map((s, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: three fixed segments
            <span key={i} className={`h-1.5 rounded-full ${SEGMENT_CLASS[s]}`} />
          ))}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {deleteControl}
        <Link
          href={model.continueHref}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-[18px] font-bold text-[14px] text-white no-underline hover:bg-accent-strong"
        >
          Continue
        </Link>
      </div>
    </li>
  );
}

const STATUS_CLASS = {
  blocked: { text: "text-[#8A1A12]", dot: "bg-blocked" },
  warning: { text: "text-[#8A4A0B]", dot: "bg-[#B45309]" },
  passes: { text: "text-accent-strong", dot: "bg-passes" },
} as const;

function ActiveCard({ goal, uid, deleteControl }: GoalCardProps) {
  const state = useAnalysis(uid, goal.id, goal.latestAnalysisMonth);
  const model = state.status === "ready" ? activeModel(goal, state.analysis) : null;
  return (
    <li className="flex flex-wrap items-center gap-6 rounded-2xl border border-line bg-surface px-6 py-[22px]">
      <IconTile goal={goal} tone="accent" />
      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1.5">
        <TitleRow goal={goal}>
          <span className="rounded-full bg-accent-tint px-2.5 py-[3px] font-bold text-[12px] text-accent-strong">
            Active
          </span>
        </TitleRow>
        <span className="text-[14px] text-muted">{cardSummary(goal)}</span>
        {model ? (
          <span
            className={`inline-flex items-start gap-1.5 text-[13px] ${STATUS_CLASS[model.status.tone].text}`}
          >
            <span
              className={`mt-[6px] size-2 shrink-0 rounded-full ${STATUS_CLASS[model.status.tone].dot}`}
            />
            {model.status.text}
          </span>
        ) : (
          <span className="text-[13px] text-muted">
            {state.status === "loading" ? "Loading the latest analysis" : "No analysis yet"}
          </span>
        )}
      </div>
      {model && (
        <div className="flex min-w-[150px] flex-col items-end gap-0.5">
          <span className="font-extrabold text-[32px] tabular-nums leading-none tracking-[-0.02em]">
            {model.figure}
          </span>
          <span className="text-[12px] text-muted">{model.unit}</span>
          <span className="text-[12px] text-muted">{model.dataMonth}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        {deleteControl}
        <Link href={`/goals/${goal.id}/result/`} className={SECONDARY_BUTTON}>
          View
          <Arrow />
        </Link>
      </div>
    </li>
  );
}

const SECONDARY_BUTTON =
  "inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#C9CFC9] bg-surface px-[18px] font-semibold text-[14px] text-ink no-underline hover:bg-page";

function IconTile({ goal, tone }: { goal: Goal; tone: "accent" | "muted" }) {
  return (
    <span
      className={`inline-flex size-[52px] shrink-0 items-center justify-center rounded-[14px] ${
        tone === "accent" ? "bg-accent-tint" : "bg-[#EEF0EC]"
      }`}
    >
      <GoalIcon type={goal.type} color={tone === "accent" ? "#1F7A4D" : "#4B5752"} />
    </span>
  );
}

function TitleRow({ goal, children }: { goal: Goal; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <h2 className="m-0 font-bold text-[18px]">{GOAL_TITLE[goal.type]}</h2>
      {children}
    </div>
  );
}

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
