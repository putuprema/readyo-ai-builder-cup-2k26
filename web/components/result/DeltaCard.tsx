import type { DeltaView, Trend } from "./delta";
import { StatusPill } from "./StatusPill";

// "What moved since last month" (specs/13-ui-monthly-assumptions.md task 3), shown above the
// plan when the analysis came from a monthly run.

const TREND_TONE: Record<Trend, string> = {
  better: "bg-accent-tint text-accent-strong",
  worse: "bg-[#FDECEA] text-[#8A1A12]",
  same: "bg-page text-muted",
};

export function DeltaCard({ view }: { view: DeltaView }) {
  return (
    <section
      aria-labelledby="delta-title"
      className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 sm:px-7 sm:py-6 print:break-inside-avoid"
    >
      <div className="flex flex-col gap-1.5">
        <h2
          id="delta-title"
          className="m-0 font-semibold text-[13px] text-muted uppercase tracking-[0.06em]"
        >
          {view.title}
        </h2>
        <p className="m-0 max-w-[760px] font-bold text-[18px] leading-[1.4]">{view.summary}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)]">
        <div className="flex flex-col gap-2 rounded-xl bg-page p-4">
          <h3 className="m-0 font-semibold text-[13px] text-muted">{view.monthsLabel}</h3>
          <p className="m-0 flex flex-wrap items-baseline gap-x-2 font-extrabold text-[20px] tabular-nums">
            <span className="text-muted line-through decoration-1">{view.monthsFrom}</span>
            <span aria-hidden="true" className="text-muted">
              →
            </span>
            <span className="sr-only">to</span>
            <span>{view.monthsTo}</span>
          </p>
          <span
            className={`self-start rounded-full px-2.5 py-1 font-bold text-[12px] ${TREND_TONE[view.trend]}`}
          >
            {view.trendText}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="m-0 font-bold text-[14px]">Checks that moved</h3>
          {view.metrics.length === 0 ? (
            <p className="m-0 text-[14px] text-muted">
              No check moved by more than half a percent.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {view.metrics.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-[#F0F2EE] border-b py-2 text-[14px] last:border-b-0"
                >
                  <span className="font-semibold">{m.label}</span>
                  <span className="flex flex-wrap items-center gap-x-2 tabular-nums">
                    <span className="text-muted">{m.from}</span>
                    <span aria-hidden="true" className="text-muted">
                      →
                    </span>
                    <span className="sr-only">to</span>
                    <span className="font-semibold">{m.to}</span>
                    {m.statusChanged && (
                      <span className="text-[13px]">
                        <StatusPill status={m.toStatus} label={m.toStatusLabel} />
                        <span className="sr-only"> (was {m.fromStatusLabel})</span>
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="m-0 font-bold text-[14px]">Actions you committed to</h3>
          {view.actions.length === 0 ? (
            <p className="m-0 text-[14px] text-muted">
              You had not committed to an action last month.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {view.actions.map((a) => (
                <li key={a.actionId} className="flex items-start gap-2.5 text-[14px]">
                  <KeptIcon kept={a.kept} />
                  <span className="flex flex-col">
                    <span className="font-semibold">
                      {a.title}
                      <span className={a.kept ? "text-accent-strong" : "text-[#8A1A12]"}>
                        {a.kept ? " · kept" : " · not kept"}
                      </span>
                    </span>
                    <span className="text-[13px] text-muted">{a.evidence}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function KeptIcon({ kept }: { kept: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full ${
        kept ? "bg-accent-tint" : "bg-[#FDECEA]"
      }`}
    >
      <svg
        aria-hidden="true"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={kept ? "#1F7A4D" : "#B42318"}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {kept ? <path d="m5 12 5 5L20 7" /> : <path d="M6 6l12 12M18 6 6 18" />}
      </svg>
    </span>
  );
}
