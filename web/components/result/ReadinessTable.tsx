import type { MetricRow } from "./model";
import { StatusPill } from "./StatusPill";

/** The seven readiness checks: You · Rule · Status · What it means (docs/screens.md "3"). */
export function ReadinessTable({ rows }: { rows: MetricRow[] }) {
  return (
    <section aria-labelledby="readiness-heading" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="readiness-heading" className="m-0 font-bold text-[18px]">
          Readiness checks
        </h2>
        <div className="flex flex-wrap gap-4 text-[12px]">
          <StatusPill status="passes" label="Passes" />
          <StatusPill status="needs_work" label="Needs work" />
          <StatusPill status="blocks" label="Blocks approval" />
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[760px] border-collapse text-[14px]">
          <thead>
            <tr className="text-left text-[12px] text-muted uppercase tracking-[0.06em]">
              <th scope="col" className="border-line border-b px-4 py-3 font-semibold sm:px-5">
                Check
              </th>
              <th scope="col" className="border-line border-b px-3 py-3 font-semibold">
                You
              </th>
              <th scope="col" className="border-line border-b px-3 py-3 font-semibold">
                Rule
              </th>
              <th scope="col" className="border-line border-b px-3 py-3 font-semibold">
                Status
              </th>
              <th scope="col" className="border-line border-b px-4 py-3 font-semibold sm:px-5">
                What it means
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-[#F0F2EE] border-b last:border-b-0">
                <th scope="row" className="px-4 py-3 text-left font-semibold sm:px-5">
                  {row.label}
                </th>
                <td className="px-3 py-3 tabular-nums">{row.you}</td>
                <td className="px-3 py-3 text-muted tabular-nums">{row.rule}</td>
                <td className="px-3 py-3">
                  <StatusPill status={row.status} label={row.statusLabel} />
                </td>
                <td className="px-4 py-3 text-muted sm:px-5">{row.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
