"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { monthName, nextMonthKey } from "@/components/result/format";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/lib/auth";
import { CheckInForm } from "./CheckInForm";
import { checkInMonth, goalChip, monthOnly, previousSubmitted } from "./model";
import { type CheckInData, useCheckInData } from "./useCheckInData";

// 5 · Monthly check-in, the Documents tab (docs/screens.md "5" and "5a"). Which month to add
// comes from the banner rule; in `next dev` a `?month=YYYY-MM` parameter picks a month that is
// not over yet, so the flow can be tried on the emulators before the month ends.

export function CheckInPage() {
  return (
    <>
      <SiteHeader active="documents" />
      <RequireAuth>
        <CheckInScreen />
      </RequireAuth>
    </>
  );
}

function useMonthOverride(): string | null {
  const [month, setMonth] = useState<string | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    setMonth(new URLSearchParams(window.location.search).get("month"));
  }, []);
  return month;
}

function CheckInScreen() {
  const { state } = useAuth();
  const uid = state.user?.uid ?? null;
  const data = useCheckInData(uid);
  const override = useMonthOverride();

  return (
    <main className="mx-auto box-border flex w-full max-w-[1120px] flex-col gap-7 px-4 pt-8 pb-16 sm:px-8 sm:pt-10">
      <Body data={data} uid={uid} override={override} />
    </main>
  );
}

function Body({
  data,
  uid,
  override,
}: {
  data: CheckInData;
  uid: string | null;
  override: string | null;
}) {
  if (data.status === "loading") {
    return (
      <p className="m-0 text-[15px] text-muted" aria-busy="true">
        Loading your sources
      </p>
    );
  }
  if (data.status === "error") {
    return (
      <p
        role="alert"
        className="m-0 rounded-[10px] bg-[#FDECEA] px-3.5 py-3 text-[13px] text-blocked"
      >
        Could not load your documents: {data.message}
      </p>
    );
  }

  if (data.active.length === 0) {
    const analysing = data.goals.some((g) => g.status === "analysing");
    return analysing ? <Analysing /> : <NoGoals />;
  }

  const submitted = data.months.map((m) => m.month);
  const month = checkInMonth(new Date(), submitted, override);
  if (!month) return <UpToDate latest={submitted[submitted.length - 1] ?? null} />;

  const previous = previousSubmitted(submitted, month);
  const record = data.months.find((m) => m.month === previous)?.record ?? null;
  return (
    <CheckInForm
      uid={uid}
      month={month}
      previousMonth={previous}
      record={record}
      goals={data.active.map((a) => a.goal)}
      chips={data.active.map((a) => goalChip(a.goal, a.analysis))}
    />
  );
}

function PageTitle({ children }: { children: string }) {
  return (
    <h1 className="m-0 font-extrabold text-[30px] leading-[1.15] tracking-[-0.02em] sm:text-[34px]">
      {children}
    </h1>
  );
}

/** Up to date: the latest finished month is in; the next one opens on the 1st. */
function UpToDate({ latest }: { latest: string | null }) {
  const next = latest ? nextMonthKey(latest) : null;
  const opens = next ? nextMonthKey(next) : null;
  return (
    <>
      <PageTitle>Documents</PageTitle>
      <section className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="m-0 font-extrabold text-[22px] tracking-[-0.01em]">
          {latest ? `Your ${monthName(latest)} statements are in` : "You're up to date"}
        </h2>
        <p className="m-0 max-w-[600px] text-muted">
          {next && opens
            ? `Add ${monthOnly(next)}'s statements any time from 1 ${monthOnly(opens)}. One upload updates every active goal, and each result shows what moved since ${monthOnly(latest as string)}.`
            : "Come back after the month ends to add its statements."}
        </p>
        <Link
          href="/goals/"
          className="inline-flex min-h-12 items-center rounded-xl border border-[#C9CFC9] bg-surface px-5 font-semibold text-[15px] text-ink no-underline"
        >
          Go to my goals
        </Link>
      </section>
    </>
  );
}

function Analysing() {
  return (
    <>
      <PageTitle>Documents</PageTitle>
      <p
        role="status"
        className="m-0 rounded-[10px] bg-[#FEF6EC] px-3.5 py-3 text-[#6B3A08] text-[13px]"
      >
        Your goals are being analysed. Come back when the analysis is done to add the next month.
      </p>
    </>
  );
}

const STEPS = [
  { tag: "1 · Now", title: "Create a goal", text: "House, car or wedding", current: true },
  {
    tag: "2 · Same flow",
    title: "Add one month of statements",
    text: "Bank, PayLater, investments",
  },
  { tag: "3 · Every month", title: "Check in here", text: "One upload updates every goal" },
];

/** 5a · Documents, no goals yet. */
function NoGoals() {
  return (
    <>
      <PageTitle>Documents</PageTitle>
      <section className="flex flex-col items-center gap-5 rounded-[20px] border border-line bg-surface px-5 py-12 text-center sm:px-8 sm:py-14">
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
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5" />
            <path d="M9 13h6M9 17h4" />
          </svg>
        </span>
        <div className="flex max-w-[540px] flex-col gap-2">
          <h2 className="m-0 font-extrabold text-[24px] tracking-[-0.02em]">Start with a goal</h2>
          <p className="m-0 text-muted">
            Your statements are read against a goal, so you add them while creating one. After that,
            you'll come back here once a month to add new statements and update all your goals at
            once.
          </p>
        </div>
        <ol className="m-0 grid w-full max-w-[760px] list-none grid-cols-1 gap-4 p-0 text-left sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.tag} className="flex flex-col gap-1.5 rounded-[14px] bg-page p-[18px]">
              <span
                className={`font-bold text-[12px] uppercase tracking-[0.06em] ${
                  step.current ? "text-accent-strong" : "text-muted"
                }`}
              >
                {step.tag}
              </span>
              <span className="font-bold">{step.title}</span>
              <span className="text-[13px] text-muted">{step.text}</span>
            </li>
          ))}
        </ol>
        <Link
          href="/goals/new/?type=house"
          className="inline-flex min-h-[52px] items-center gap-2.5 rounded-xl bg-accent px-[26px] font-bold text-[16px] text-white no-underline"
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
      </section>
    </>
  );
}
