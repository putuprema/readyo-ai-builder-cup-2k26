"use client";

import type { RunStatus } from "@adidi/shared";
import styles from "./progress.module.css";
import { type ChipState, PIPELINE_STAGES, progressCopy, STAGE_COPY } from "./stages";

// The full-screen progress view (docs/screens.md "2b"; design artboard Analyzing). Pure
// presentation: the run document comes in as a prop, so the same view runs on a fake run
// (task 1) and on the Firestore listener (task 5). The dark header is part of this screen in
// the design, so it is drawn here rather than with the white SiteHeader.

export interface ProgressViewProps {
  run: RunStatus | null;
  /** One-line goal description for the header ("House · Tangerang Selatan · 2028"). */
  goalLabel?: string;
  goalsHref: string;
  resultHref: string;
  documentsHref: string;
}

export function ProgressView({
  run,
  goalLabel,
  goalsHref,
  resultHref,
  documentsHref,
}: ProgressViewProps) {
  const copy = progressCopy(run);

  return (
    <div className="flex min-h-screen flex-col bg-[#10231A] text-[#F2F5F1]">
      <header className="mx-auto flex min-h-[72px] w-full max-w-[1120px] items-center justify-between gap-4 px-4 sm:px-8">
        <span className="flex items-center gap-2.5 font-extrabold text-[17px]">
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-accent">
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 18 10 12l4 4 6-8" />
            </svg>
          </span>
          [APP NAME]
        </span>
        {goalLabel && <span className="text-[#B7C7BE] text-[13px]">{goalLabel}</span>}
      </header>

      <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col justify-center gap-12 px-4 py-12 sm:px-8 sm:pb-[72px]">
        <div className="flex flex-wrap items-center gap-8 sm:gap-12">
          <div aria-hidden="true" className="relative size-[168px] shrink-0">
            <span
              className={`absolute inset-0 rounded-full bg-accent ${copy.running ? styles.halo : "opacity-55"}`}
            />
            <span className="absolute inset-5 rounded-full bg-[#17322A]" />
            {copy.running && (
              <span
                className={`absolute inset-5 rounded-full border-6 border-white/10 border-t-[#9FE0BB] border-r-[#9FE0BB] ${styles.ring}`}
              />
            )}
            <span className="absolute inset-0 flex items-center justify-center font-extrabold text-[34px] tabular-nums tracking-[-0.02em]">
              {copy.percent}%
            </span>
          </div>

          <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-4" aria-live="polite">
            <span className="font-bold text-[#9FE0BB] text-[13px] uppercase tracking-[0.08em]">
              {copy.failed ? "Analysis stopped" : `Step ${copy.stepNumber} of 4`}
            </span>
            <h1
              key={copy.headline}
              className={`m-0 font-extrabold text-[40px] leading-[1.05] tracking-[-0.035em] sm:text-[56px] ${styles.line}`}
            >
              {copy.headline}
            </h1>
            <p
              className={`m-0 max-w-[620px] text-[#C9D6CF] text-[17px] sm:text-[19px] ${styles.line}`}
            >
              {copy.detail}
            </p>
            {copy.failed && (
              <a
                href={documentsHref}
                className="inline-flex min-h-[52px] items-center gap-2.5 self-start rounded-xl bg-[#F2F5F1] px-6 font-extrabold text-[#10231A] text-[16px] no-underline"
              >
                Back to your documents
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          <div
            className="h-2.5 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={copy.percent}
            aria-label="Analysis progress"
          >
            <div
              className={`h-full rounded-full bg-accent ${copy.running ? styles.stripes : ""}`}
              style={{ width: `${copy.percent}%` }}
            />
          </div>
          <ol className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE_STAGES.map((stage, i) => (
              <StageChip key={stage} state={copy.chips[i] ?? "todo"} stage={stage} />
            ))}
          </ol>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="max-w-[520px] text-[#B7C7BE] text-[13px]">
            Usually a few minutes. No need to wait here: it keeps running, and your goals list shows
            its progress.
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={goalsHref}
              className="inline-flex min-h-[52px] items-center gap-2.5 rounded-xl border border-[#F2F5F1]/35 px-[22px] font-bold text-[#F2F5F1] text-[16px] no-underline"
            >
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
                <path d="M19 12H5M11 6l-6 6 6 6" />
              </svg>
              Go to my goals
            </a>
            {copy.finished && (
              <a
                href={resultHref}
                className={`inline-flex min-h-[52px] items-center gap-2.5 rounded-xl bg-[#F2F5F1] px-[26px] font-extrabold text-[#10231A] text-[16px] no-underline ${styles.line}`}
              >
                See your readiness
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
              </a>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function StageChip({
  stage,
  state,
}: {
  stage: (typeof PIPELINE_STAGES)[number];
  state: ChipState;
}) {
  const copy = STAGE_COPY[stage];
  const box =
    state === "active"
      ? "border-[#9FE0BB] bg-[#9FE0BB]/12"
      : state === "done"
        ? "border-white/12 bg-white/4"
        : "border-white/12 bg-transparent";
  const ink = state === "todo" ? "text-[#8FA399]" : "text-[#F2F5F1]";
  const sub = state === "todo" ? "text-[#7A8F84]" : "text-[#B7C7BE]";
  const label = state === "done" ? "done" : state === "active" ? "in progress" : "to do";
  return (
    <li className={`flex flex-col gap-1.5 rounded-xl border px-4 py-3.5 ${box}`}>
      <span className={`flex items-center gap-2 font-bold text-[14px] ${ink}`}>
        {state === "done" && (
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 12 5 5L20 7" />
          </svg>
        )}
        {state === "active" && (
          <span
            aria-hidden="true"
            className={`inline-block size-3.5 rounded-full border-[2.5px] border-[#9FE0BB]/25 border-t-[#9FE0BB] ${styles.ring}`}
          />
        )}
        {state === "todo" && (
          <span
            aria-hidden="true"
            className="inline-block size-3.5 rounded-full border-[1.5px] border-[#5E7469]"
          />
        )}
        {copy.name}
        <span className="sr-only">, {label}</span>
      </span>
      <span className={`text-[12px] ${sub}`}>{copy.note}</span>
    </li>
  );
}
