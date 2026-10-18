"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useGoals } from "@/components/goals/useGoals";
import { SignInCard } from "@/components/SignInCard";
import { SiteHeader } from "@/components/SiteHeader";
import { SampleResultCard } from "@/components/welcome/SampleResultCard";
import { useAuth } from "@/lib/auth";

// 0 · Welcome (docs/screens.md). Signed out, the greeting and the sample card give way to
// sign-in; signed in, "Create your first goal" leads to the goal form. The returning-user
// redirect to the goals list is spec 12: a signed-in user with at least one goal lands there.

const STEPS = [
  {
    title: "Pick a goal, add a few details",
    text: "House, car or wedding. We ask only what changes the price or the loan rules, then estimate the target for you with sources.",
  },
  {
    title: "Upload one month of statements",
    text: "Bank PDFs, GoPay screenshots, a PayLater bill, your investment portfolio. Originals are deleted after we read them.",
  },
  {
    title: "Get the month, the blockers, the plan",
    text: "Cash and loan paths side by side, seven readiness checks against real lending rules, and actions each verified by a month-by-month simulation.",
  },
];

const TRUST = [
  {
    title: "Pinjol and PayLater count",
    text: "Most apps ignore them. Banks don't. We read those statements too.",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M7 15h3" />
      </>
    ),
  },
  {
    title: "Every number has a rule behind it",
    text: "DTI caps, DP floors and tenor limits are listed with their sources.",
    icon: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
  },
  {
    title: "Your files don't stay",
    text: "Statements are deleted right after extraction. Only the structured numbers remain, and you can wipe those any time.",
    icon: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
  },
];

export default function Welcome() {
  const { state } = useAuth();
  const signedIn = state.status === "signed_in";
  const goals = useGoals(signedIn ? state.user.uid : null);
  const router = useRouter();
  const returning = goals.status === "ready" && goals.goals.length > 0;
  useEffect(() => {
    if (returning) router.replace("/goals/");
  }, [returning, router]);
  const firstName = signedIn
    ? (state.user.displayName?.split(" ")[0] ?? state.user.email ?? "there")
    : null;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto box-border flex w-full max-w-[1120px] flex-col gap-14 px-4 pt-14 pb-20 sm:px-8 sm:pt-[72px]">
        <section className="flex flex-wrap items-center gap-12">
          <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-6">
            {firstName && (
              <span className="self-start rounded-full bg-accent-tint px-3 py-1.5 font-bold text-[13px] text-accent-strong">
                Hi, {firstName}. Welcome.
              </span>
            )}
            <h1 className="m-0 max-w-[600px] font-extrabold text-[36px] leading-[1.1] tracking-[-0.03em] sm:text-[48px]">
              Find out how far you are from the house, the car, or the wedding, and what to change
              to get there sooner.
            </h1>
            <p className="m-0 max-w-[560px] text-[17px] text-muted">
              Upload a month of bank, e-wallet and PayLater statements. We turn them into one
              answer: the month you'd be ready, which numbers are holding you back, and a plan
              checked against the same rules a bank uses.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/goals/new/?type=house"
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
              <span className="text-[13px] text-muted">
                Takes about 3 minutes. No bank login needed.
              </span>
            </div>
          </div>

          {state.status === "signed_out" ? (
            <div className="flex min-w-0 flex-[1_1_360px] justify-center">
              <SignInCard title="Sign in to start" />
            </div>
          ) : (
            <SampleResultCard />
          )}
        </section>

        <section className="flex flex-col gap-5">
          <h2 className="m-0 font-extrabold text-[22px] tracking-[-0.02em]">How it works</h2>
          <ol className="m-0 grid list-none grid-cols-1 gap-5 p-0 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6"
              >
                <span className="inline-flex size-9 items-center justify-center rounded-full bg-accent font-extrabold text-white">
                  {i + 1}
                </span>
                <h3 className="m-0 font-bold text-[17px]">{step.title}</h3>
                <p className="m-0 text-[14px] text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {TRUST.map((point) => (
            <div
              key={point.title}
              className="flex items-start gap-3.5 rounded-2xl border border-line bg-surface p-5"
            >
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#155C38"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 shrink-0"
              >
                {point.icon}
              </svg>
              <div className="flex flex-col gap-1">
                <strong className="text-[15px]">{point.title}</strong>
                <span className="text-[13px] text-muted">{point.text}</span>
              </div>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
