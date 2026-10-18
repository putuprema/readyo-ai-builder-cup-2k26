"use client";

import type { Analysis } from "@adidi/shared";
import { useId, useState } from "react";
import { alsoConsideredText, ruleRows } from "./rules-table";

// The "Also considered" card with the rules table behind "See the rules used"
// (docs/screens.md "3"; design artboard RulesPanel). Collapsed on first load.

export function RulesPanel({
  analysis,
  assumptionsHref,
}: {
  analysis: Analysis;
  assumptionsHref: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rows = ruleRows(analysis);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[#C9CFC9] border-dashed bg-surface px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-[1_1_420px] items-start gap-3">
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#4B5752"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 shrink-0"
          >
            <path d="M9 18h6M10 21h4" />
            <path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.5 1 2.5h6c0-1 .4-1.9 1-2.5A6 6 0 0 0 12 3z" />
          </svg>
          <p className="m-0 text-[14px] text-muted">
            <strong className="text-ink">Also considered, rejected by the simulator:</strong>{" "}
            {alsoConsideredText(analysis)}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 font-bold text-[13px] text-accent-strong"
        >
          {open ? "Hide the rules" : "See the rules used"}
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={open ? "rotate-180" : ""}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {open && (
        <div id={panelId} className="flex flex-col gap-3 border-line border-t pt-3.5">
          <h3 className="m-0 font-bold text-[13px]">Rules checked for this goal</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-muted uppercase tracking-[0.06em]">
                  <th scope="col" className="border-line border-b py-1.5 pr-3 pb-2 font-semibold">
                    Rule
                  </th>
                  <th scope="col" className="border-line border-b px-3 py-1.5 pb-2 font-semibold">
                    Value used
                  </th>
                  <th scope="col" className="border-line border-b px-3 py-1.5 pb-2 font-semibold">
                    You
                  </th>
                  <th scope="col" className="border-line border-b py-1.5 pb-2 pl-3 font-semibold">
                    Effect on your plan
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rule} className="border-[#F0F2EE] border-b last:border-b-0">
                    <th scope="row" className="py-3 pr-3 text-left font-bold">
                      {row.label}
                    </th>
                    <td className="px-3 py-3 tabular-nums">{row.valueUsed}</td>
                    <td className="px-3 py-3 tabular-nums">{row.you}</td>
                    <td
                      className={`py-3 pl-3 ${row.blocking ? "font-semibold text-[#8A1A12]" : "text-muted"}`}
                    >
                      <span className="inline-flex items-center gap-2">
                        {row.blocking && (
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full bg-blocked"
                          />
                        )}
                        {row.effect}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 text-[13px] text-muted">
            Values come from your Assumptions page. Change one there and this goal is recalculated.{" "}
            <a href={assumptionsHref} className="font-semibold text-accent-strong no-underline">
              Open Assumptions
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
