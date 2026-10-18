"use client";

import type { Analysis, Goal } from "@adidi/shared";
import { BottomCards } from "./BottomCards";
import { assumptionRows, checkIn, eyebrow, metricRow, pathCards, subline } from "./model";
import { PathCards } from "./PathCards";
import { ReadinessTable } from "./ReadinessTable";

// The readiness result (docs/screens.md "3"; design artboard Analysis). Presentation over a
// goal and its analysis; the plan section and the rules panel are added in tasks 3 and 4.

export interface ResultPageProps {
  goal: Goal;
  analysis: Analysis;
  documentsHref: string;
  assumptionsHref: string;
}

export function ResultPage({ goal, analysis, documentsHref, assumptionsHref }: ResultPageProps) {
  const next = checkIn(analysis);
  return (
    <main className="mx-auto box-border flex w-full max-w-[1120px] flex-col gap-7 px-4 py-8 sm:px-8 sm:py-10 print:max-w-none print:px-0">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="m-0 font-semibold text-[13px] text-muted uppercase tracking-[0.06em]">
            {eyebrow(goal)}
          </p>
          <h1 className="m-0 font-extrabold text-[28px] leading-[1.15] tracking-[-0.02em] sm:text-[34px]">
            {analysis.summary}
          </h1>
          <p className="m-0 max-w-[640px] text-muted">{subline(analysis)}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <a
            href={documentsHref}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#C9CFC9] bg-surface px-4 font-semibold text-[14px] text-ink no-underline"
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
            </svg>
            {next.uploadLabel}
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#C9CFC9] bg-surface px-4 font-semibold text-[14px] text-ink"
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z" />
            </svg>
            Export PDF
          </button>
        </div>
      </section>

      <PathCards cards={pathCards(goal, analysis)} />
      <ReadinessTable rows={analysis.metrics.map(metricRow)} />
      <BottomCards
        assumptions={assumptionRows(analysis)}
        checkIn={next}
        assumptionsHref={assumptionsHref}
      />
    </main>
  );
}
