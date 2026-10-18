import type { AssumptionRow, CheckIn } from "./model";

/** The two closing cards: the assumptions used and the next check-in (no reminder). */
export function BottomCards({
  assumptions,
  checkIn,
  assumptionsHref,
}: {
  assumptions: AssumptionRow[];
  checkIn: CheckIn;
  assumptionsHref: string;
}) {
  return (
    <section
      aria-label="Assumptions and next check-in"
      className="grid grid-cols-1 gap-5 lg:grid-cols-2"
    >
      <div className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface px-5 py-5 sm:px-6">
        <h2 className="m-0 font-bold text-[15px]">Assumptions you can change</h2>
        <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[14px]">
          {assumptions.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted">{row.label}</dt>
              <dd className="m-0 text-right font-semibold tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
        <a
          href={assumptionsHref}
          className="inline-flex min-h-11 items-center self-start font-semibold text-[14px] text-accent-strong no-underline"
        >
          Edit assumptions and see sources
        </a>
      </div>
      <div className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface px-5 py-5 sm:px-6">
        <h2 className="m-0 font-bold text-[15px]">Next check-in</h2>
        <p className="m-0 text-[14px] text-muted">{checkIn.sentence}</p>
      </div>
    </section>
  );
}
