"use client";

import type { GoalType } from "@adidi/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { GoalIcon } from "./GoalIcon";

// 4a · Goals list, no goals yet, and 5a · Documents, no goals yet (docs/screens.md). Car and
// wedding goals are "coming soon" this milestone, so only the house tile opens the form.

const TILES: { type: GoalType; title: string; subtitle: string; available: boolean }[] = [
  { type: "house", title: "Buy a house", subtitle: "Cash or KPR", available: true },
  { type: "car", title: "Buy a car", subtitle: "Cash or KKB", available: false },
  { type: "wedding", title: "Wedding", subtitle: "Savings target", available: false },
];

const FIRST_GOAL_HREF = "/goals/new/?type=house";

/** The "No goals yet" card that replaces the goals list (4a). */
export function GoalsEmpty() {
  return (
    <EmptyCard
      icon={
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.2" />
        </>
      }
      title="No goals yet"
      text="Pick what you're working toward and we'll tell you how far you are, what's holding you back, and what to change to get there sooner."
    >
      <ul className="m-0 grid w-full max-w-[720px] list-none grid-cols-1 gap-4 p-0 sm:grid-cols-3">
        {TILES.map((tile) => {
          const body = (
            <>
              <GoalIcon type={tile.type} size={28} color={tile.available ? "#1F7A4D" : "#4B5752"} />
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 font-bold text-[16px]">
                  {tile.title}
                  {!tile.available && (
                    <span className="rounded-full bg-page px-2 py-0.5 font-semibold text-[11px] text-muted">
                      Soon
                    </span>
                  )}
                </span>
                <span className="text-[13px] text-muted">{tile.subtitle}</span>
              </span>
            </>
          );
          const tileClass =
            "flex h-full flex-col items-start gap-3 rounded-[14px] border border-line bg-surface p-5 text-left text-ink no-underline";
          return (
            <li key={tile.type}>
              {tile.available ? (
                <Link
                  href={`/goals/new/?type=${tile.type}`}
                  className={`${tileClass} hover:border-accent`}
                >
                  {body}
                </Link>
              ) : (
                <div aria-disabled="true" className={`${tileClass} opacity-70`}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <FirstGoalButton />
      <span className="text-[13px] text-muted">
        Takes about 3 minutes. You'll need one month of bank, PayLater and investment statements.
      </span>
    </EmptyCard>
  );
}

const STEPS = [
  {
    tag: "1 · Now",
    title: "Create a goal",
    text: "A house for now; car and wedding soon",
    now: true,
  },
  {
    tag: "2 · Same flow",
    title: "Add one month of statements",
    text: "Bank, PayLater, investments",
  },
  { tag: "3 · Every month", title: "Check in here", text: "One upload updates every goal" },
];

/**
 * The Documents tab for a user with no goals (5a). Rendered by the Documents page (spec 13)
 * instead of the monthly check-in when `useGoals` returns no goals; includes the page title.
 */
export function DocumentsNoGoals() {
  return (
    <main className="mx-auto box-border flex w-full max-w-[1120px] flex-col gap-7 px-4 pt-10 pb-16 sm:px-8">
      <h1 className="m-0 font-extrabold text-[34px] leading-[1.15] tracking-[-0.02em]">
        Documents
      </h1>
      <EmptyCard
        icon={
          <>
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5" />
            <path d="M9 13h6M9 17h4" />
          </>
        }
        title="Start with a goal"
        text="Your statements are read against a goal, so you add them while creating one. After that, you'll come back here once a month to add new statements and update all your goals at once."
      >
        <ol className="m-0 grid w-full max-w-[760px] list-none grid-cols-1 gap-4 p-0 text-left sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.tag} className="flex flex-col gap-1.5 rounded-[14px] bg-page p-[18px]">
              <span
                className={`font-bold text-[12px] uppercase tracking-[0.06em] ${
                  step.now ? "text-accent-strong" : "text-muted"
                }`}
              >
                {step.tag}
              </span>
              <span className="font-bold">{step.title}</span>
              <span className="text-[13px] text-muted">{step.text}</span>
            </li>
          ))}
        </ol>
        <FirstGoalButton />
      </EmptyCard>
    </main>
  );
}

function EmptyCard({
  icon,
  title,
  text,
  children,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col items-center gap-5 rounded-[20px] border border-line bg-surface px-5 py-14 text-center sm:px-8">
      <span className="inline-flex size-[72px] items-center justify-center rounded-[20px] bg-accent-tint">
        <svg
          aria-hidden="true"
          width="34"
          height="34"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#1F7A4D"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {icon}
        </svg>
      </span>
      <div className="flex max-w-[540px] flex-col gap-2">
        <h2 className="m-0 font-extrabold text-[24px] tracking-[-0.02em]">{title}</h2>
        <p className="m-0 text-muted">{text}</p>
      </div>
      {children}
    </section>
  );
}

function FirstGoalButton() {
  return (
    <Link
      href={FIRST_GOAL_HREF}
      className="inline-flex min-h-[52px] items-center gap-2.5 rounded-xl bg-accent px-[26px] font-bold text-[16px] text-white no-underline hover:bg-accent-strong"
    >
      Create your first goal
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}
