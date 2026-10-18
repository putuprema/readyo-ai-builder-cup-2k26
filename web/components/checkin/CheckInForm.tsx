"use client";

import type { Goal, MonthRecord } from "@adidi/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileRow } from "@/components/documents/UploadCard";
import { useUploads } from "@/components/documents/useUploads";
import { monthName } from "@/components/result/format";
import { ApiError } from "@/lib/api";
import { cardOf, readyItems } from "@/lib/documents";
import { runErrorMessage, startRun } from "@/lib/runs";
import { AddSourceZone, MissingSlot } from "./DropSlots";
import { GoalChips } from "./GoalChips";
import {
  ALL_KINDS,
  addedCount,
  canSubmitCheckIn,
  checkInFooter,
  type GoalChip,
  missingHint,
  monthOnly,
  type SourceRow,
  sourceRows,
} from "./model";
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
  const router = useRouter();
  const records = useMonthRecords(uid, previousMonth);
  const rows = record && records ? sourceRows(record, records) : [];
  const name = monthOnly(month);
  const previousName = previousMonth ? monthOnly(previousMonth) : "Last month";
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { items, rejected, add, remove, changeKind } = useUploads({ month, onNotice: setNotice });
  const ready = readyItems(items);
  const newItems = items.filter((i) => i.slot === "new");

  function addToRow(row: SourceRow, files: File[]) {
    add(files.slice(0, 1), {
      group: row.documentId,
      card: cardOf(row.kind),
      sourceKind: row.kind,
      slot: row.documentId,
    });
  }

  async function submit() {
    if (!canSubmitCheckIn(items) || goals.length === 0) return;
    setSubmitting(true);
    setNotice(null);
    const documentIds = ready.flatMap((i) => (i.docId ? [i.docId] : []));
    try {
      const { runId } = await startRun({
        kind: "monthly",
        goalIds: goals.map((g) => g.id),
        month,
        documentIds,
      });
      router.push(`/goals/${encodeURIComponent(goals[0]?.id ?? "")}/progress/?run=${runId}`);
    } catch (error) {
      const fallback = "Could not start the analysis. Try again.";
      setNotice(
        error instanceof ApiError
          ? runErrorMessage(error.code, error.message || fallback)
          : fallback,
      );
      setSubmitting(false);
    }
  }

  const submitEnabled = canSubmitCheckIn(items) && !submitting;

  function renderSlot(row: SourceRow) {
    const mine = items.filter((i) => i.slot === row.documentId);
    const refused = rejected[row.documentId] ?? [];
    return (
      <div className="flex flex-col gap-1.5">
        {mine.length > 0 ? (
          mine.map((item) => (
            <FileRow
              key={item.localId}
              item={item}
              kinds={[{ value: row.kind, label: row.kindLabel }]}
              onRemove={(i) => void remove(i)}
              onKindChange={changeKind}
              disabled={submitting}
            />
          ))
        ) : (
          <MissingSlot
            hint={missingHint(row.kind, name)}
            sourceTitle={row.title}
            onFiles={(files) => addToRow(row, files)}
            disabled={submitting}
          />
        )}
        {refused.length > 0 && <Refused list={refused} />}
      </div>
    );
  }

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
          added={addedCount(rows, items)}
          renderSlot={renderSlot}
        >
          {newItems.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="m-0 font-bold text-[14px]">New sources</h3>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {newItems.map((item) => (
                  <li key={item.localId}>
                    <FileRow
                      item={item}
                      kinds={ALL_KINDS}
                      onRemove={(i) => void remove(i)}
                      onKindChange={changeKind}
                      disabled={submitting}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-4">
            <AddSourceZone
              onFiles={(files) =>
                add(files, { group: "new", card: "bank", sourceKind: "bank", slot: "new" })
              }
              disabled={submitting}
            />
            <p className="m-0 flex flex-[1_1_320px] items-start gap-2.5 rounded-xl bg-page px-4 py-3 text-[13px] text-muted">
              <InfoIcon />
              <span>
                You can submit with sources missing. We'll carry {previousName}'s numbers forward
                for them and mark those results as estimates.
              </span>
            </p>
          </div>
          {(rejected.new ?? []).length > 0 && <Refused list={rejected.new ?? []} />}
        </SourcesTable>
      )}

      {notice && (
        <p
          role="alert"
          className="m-0 rounded-[10px] bg-[#FDECEA] px-3.5 py-3 text-[13px] text-blocked"
        >
          {notice}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-line border-t pt-6">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-[14px]" aria-live="polite">
            {checkInFooter(ready.length, goals.length)}
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
            onClick={() => void submit()}
            disabled={!submitEnabled}
            className="inline-flex min-h-12 items-center gap-2.5 rounded-xl bg-accent px-6 font-bold text-[15px] text-white disabled:bg-[#9BB5A6]"
          >
            {submitting ? "Submitting" : "Submit"}
            <ArrowIcon />
          </button>
        </div>
      </div>
    </>
  );
}

function Refused({ list }: { list: { name: string; reason: string }[] }) {
  return (
    <ul role="alert" className="m-0 flex list-none flex-col gap-1 p-0 text-[12px] text-blocked">
      {list.map((r) => (
        <li key={r.name}>
          {r.name}: {r.reason}
        </li>
      ))}
    </ul>
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
