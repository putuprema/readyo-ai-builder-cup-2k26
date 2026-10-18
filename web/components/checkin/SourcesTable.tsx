"use client";

import type { ReactNode } from "react";
import { addedCounter, type SourceRow } from "./model";

// "Same sources as last month" (artboard 5): Source · last month (what it contained) · this
// month (the file, or the amber Missing drop zone). The table stacks into one block per
// source under 768 px so the page never scrolls sideways.

export function SourcesTable({
  rows,
  previousMonthName,
  monthName,
  added,
  renderSlot,
  children,
}: {
  rows: SourceRow[];
  previousMonthName: string;
  monthName: string;
  /** How many of the rows have this month's file. */
  added: number;
  /** The "this month" cell of a row. */
  renderSlot: (row: SourceRow) => ReactNode;
  /** "Add a new source" and the note, under the table. */
  children?: ReactNode;
}) {
  return (
    <section
      aria-labelledby="same-sources"
      className="flex flex-col gap-[18px] rounded-2xl border border-line bg-surface p-5 sm:px-7 sm:py-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="same-sources" className="m-0 font-bold text-[18px]">
            Same sources as last month
          </h2>
          <span className="text-[13px] text-muted">
            Upload the same accounts so the month-on-month comparison is fair.
          </span>
        </div>
        {rows.length > 0 && (
          <span
            aria-live="polite"
            className="rounded-full bg-accent-tint px-3 py-1.5 font-bold text-[13px] text-accent-strong"
          >
            {addedCounter(added, rows.length)}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="m-0 text-[14px] text-muted">
          No sources were recorded for {previousMonthName}. Add this month's statements below.
        </p>
      ) : (
        <table className="w-full border-collapse text-[14px] max-md:block">
          <thead className="max-md:hidden">
            <tr className="text-left text-[12px] text-muted uppercase tracking-[0.06em]">
              <th scope="col" className="border-line border-b pt-2 pr-3 pb-2.5 font-semibold">
                Source
              </th>
              <th scope="col" className="border-line border-b px-3 pt-2 pb-2.5 font-semibold">
                {previousMonthName}
              </th>
              <th
                scope="col"
                className="w-[52%] border-line border-b pt-2 pb-2.5 pl-3 font-semibold"
              >
                {monthName}
              </th>
            </tr>
          </thead>
          <tbody className="max-md:flex max-md:flex-col max-md:gap-4">
            {rows.map((row, i) => {
              const last = i === rows.length - 1;
              const border = last ? "" : "md:border-[#F0F2EE] md:border-b";
              return (
                <tr
                  key={row.documentId}
                  className={`max-md:flex max-md:flex-col max-md:gap-2 ${
                    last ? "" : "max-md:border-[#F0F2EE] max-md:border-b max-md:pb-4"
                  }`}
                >
                  <th scope="row" className={`py-3.5 pr-3 text-left max-md:p-0 ${border}`}>
                    <span className="flex flex-col">
                      <span className="font-bold">{row.title}</span>
                      <span className="font-medium text-[12px] text-muted">{row.kindLabel}</span>
                    </span>
                  </th>
                  <td className={`px-3 py-3.5 text-muted max-md:p-0 ${border}`}>
                    <span className="inline-flex items-center gap-1.5">
                      <CheckIcon />
                      <span>
                        <span className="sr-only md:hidden">{previousMonthName}: </span>
                        {row.contents}
                      </span>
                    </span>
                  </td>
                  <td className={`py-2.5 pl-3 max-md:p-0 ${border}`}>{renderSlot(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {children}
    </section>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#1F7A4D"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}
