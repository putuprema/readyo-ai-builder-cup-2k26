"use client";

import type { Goal, MonthRecord } from "@adidi/shared";
import Link from "next/link";
import { monthName } from "@/components/result/format";
import { AddSourceZone, MissingSlot } from "./DropSlots";
import { GoalChips } from "./GoalChips";
import { checkInFooter, type GoalChip, missingHint, monthOnly, sourceRows } from "./model";
import { SourcesTable } from "./SourcesTable";
import { useMonthRecords } from "./useCheckInData";

// The check-in for one month (artboard 5): eyebrow and title, the goals it updates, last
// month's sources with a slot each, "Add a new source", and the footer.

export function CheckInForm({
  uid,
  month,
  previousMonth,
  record,
  goals,
  chips,
}: {
  uid: string | null;
  month: string;
  previousMonth: string | null;
  record: MonthRecord | null;
  goals: Goal[];
  chips: GoalChip[];
}) {
  const records = useMonthRecords(uid, previousMonth);
  const rows = record && records ? sourceRows(record, records) : [];
  const name = monthOnly(month);
  const previousName = previousMonth ? monthOnly(previousMonth) : "Last month";

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="font-semibold text-[13px] text-muted uppercase tracking-[0.06em]">
          Monthly check-in · {monthName(month)}
        </span>
        <h1 className="m-0 font-extrabold text-[30px] leading-[1.15] tracking-[-0.02em] sm:text-[34px]">
          Add your {name} statements
        </h1>
        <p className="m-0 max-w-[640px] text-muted">
          One upload updates every active goal. Nothing is read until you submit; then we compare{" "}
          {name} with {previousName} and show what moved.
        </p>
      </div>

      <GoalChips chips={chips} />

      {record && !records ? (
        <p className="m-0 text-[15px] text-muted" aria-busy="true">
          Loading last month's sources
        </p>
      ) : (
        <SourcesTable
          rows={rows}
          previousMonthName={previousName}
          monthName={name}
          added={0}
          renderSlot={(row) => (
            <MissingSlot
              hint={missingHint(row.kind, name)}
              sourceTitle={row.title}
              onFiles={() => {}}
            />
          )}
        >
          <div className="flex flex-wrap gap-4">
            <AddSourceZone onFiles={() => {}} />
            <p className="m-0 flex flex-[1_1_320px] items-start gap-2.5 rounded-xl bg-page px-4 py-3 text-[13px] text-muted">
              <InfoIcon />
              <span>
                You can submit with sources missing. We'll carry {previousName}'s numbers forward
                for them and mark those results as estimates.
              </span>
            </p>
          </div>
        </SourcesTable>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-line border-t pt-6">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-[14px]" aria-live="polite">
            {checkInFooter(0, goals.length)}
          </span>
          <span className="flex items-center gap-2 text-[13px] text-muted">
            <LockIcon />
            Analysis starts when you submit. Originals are deleted once it finishes.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/goals/"
            className="inline-flex min-h-12 items-center rounded-xl border border-[#C9CFC9] bg-surface px-5 font-semibold text-[15px] text-ink no-underline"
          >
            Cancel
          </Link>
          <button
            type="button"
            disabled
            className="inline-flex min-h-12 items-center gap-2.5 rounded-xl bg-accent px-6 font-bold text-[15px] text-white disabled:bg-[#9BB5A6]"
          >
            Submit
            <ArrowIcon />
          </button>
        </div>
      </div>
    </>
  );
}

export function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#4B5752"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-px shrink-0"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ArrowIcon() {
  return (
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
  );
}
