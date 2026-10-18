"use client";

import type { Estimate, HouseInputs } from "@adidi/shared";
import { formatRupiah } from "@adidi/shared";
import Link from "next/link";
import { describeHouseInputs, describeHouseShort, relativeTime } from "@/lib/house-form";
import { Field, RupiahInput } from "./fields";

// The estimate card (docs/screens.md, "1"): empty, loading, fresh, stale and failed states.
// Stale means the form no longer matches `estimate.inputsUsed`; the page decides that.

export type EstimateState =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; estimate: Estimate; stale: boolean };

export function EstimateCard({
  state,
  price,
  onPriceChange,
  onRecalculate,
  disabled,
}: {
  state: EstimateState;
  /** The price field's text: the person's own number, or the estimate formatted. */
  price: string;
  onPriceChange: (text: string) => void;
  onRecalculate: () => void;
  disabled?: boolean;
}) {
  return (
    <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
      {state.kind === "empty" && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border-[1.5px] border-[#C9CFC9] border-dashed bg-surface px-6 py-7">
          <h2 className="m-0 font-bold text-[15px]">Estimated target</h2>
          <span className="font-extrabold text-[#C9CFC9] text-[32px] tracking-[-0.02em]">Rp —</span>
          <p className="m-0 text-[13px] text-muted">
            Fill in the house details, then press{" "}
            <strong className="text-ink">Calculate Estimate</strong>. Already know the price? You
            can type it in after.
          </p>
        </div>
      )}

      {state.kind === "loading" && (
        <div
          className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface px-6 py-7"
          aria-busy="true"
          aria-live="polite"
        >
          <h2 className="m-0 font-bold text-[15px]">Estimated target</h2>
          <span className="h-9 w-40 animate-pulse rounded-lg bg-page" aria-hidden="true" />
          <p className="m-0 text-[13px] text-muted">
            Searching current listings and price lists. This takes about 20 seconds.
          </p>
        </div>
      )}

      {state.kind === "failed" && (
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
          <h2 className="m-0 font-bold text-[15px]">Estimated target</h2>
          <div
            role="alert"
            className="rounded-[10px] border border-[#F1D3A8] bg-[#FEF6EC] px-3.5 py-3 text-[#6B3A08] text-[13px]"
          >
            {state.message}
          </div>
          <Field id="price" label="Type the price you have in mind">
            <RupiahInput
              id="price"
              size="large"
              value={price}
              onChange={onPriceChange}
              placeholder="1.350.000.000"
              disabled={disabled}
            />
          </Field>
          <button
            type="button"
            onClick={onRecalculate}
            disabled={disabled}
            className="min-h-11 self-start rounded-[10px] border border-[#C9CFC9] bg-surface px-3.5 font-semibold text-[13px] text-ink"
          >
            Try the search again
          </button>
        </div>
      )}

      {state.kind === "ready" && (
        <ReadyCard
          estimate={state.estimate}
          stale={state.stale}
          price={price}
          onPriceChange={onPriceChange}
          onRecalculate={onRecalculate}
          disabled={disabled}
        />
      )}

      <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
        <p className="m-0 text-[13px] text-muted">
          The loan rules we check against (DTI cap, DP floor, tenor by age) are listed with their
          sources under{" "}
          <Link href="/assumptions/" className="font-semibold text-accent-strong">
            Assumptions
          </Link>
          .
        </p>
      </div>
    </aside>
  );
}

function ReadyCard({
  estimate,
  stale,
  price,
  onPriceChange,
  onRecalculate,
  disabled,
}: {
  estimate: Estimate;
  stale: boolean;
  price: string;
  onPriceChange: (text: string) => void;
  onRecalculate: () => void;
  disabled?: boolean;
}) {
  const used = estimate.inputsUsed as Partial<HouseInputs>;
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 font-bold text-[15px]">Estimated target</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-tint px-2.5 py-1 font-semibold text-[12px] text-accent-strong">
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
          </svg>
          AI estimate
        </span>
      </div>

      {stale && (
        <div
          role="status"
          className="flex flex-col gap-2.5 rounded-[10px] border border-[#F1D3A8] bg-[#FEF6EC] px-3.5 py-3"
        >
          <span className="text-[#6B3A08] text-[13px]">
            <strong>You changed the details.</strong> This number is from the previous inputs.
          </span>
          <button
            type="button"
            onClick={onRecalculate}
            disabled={disabled}
            className="min-h-11 self-start rounded-[10px] bg-[#B45309] px-3.5 font-bold text-[13px] text-white disabled:opacity-60"
          >
            Recalculate
          </button>
        </div>
      )}

      <Field id="price" label="Edit if you know a better number">
        <RupiahInput
          id="price"
          size="large"
          value={price}
          onChange={onPriceChange}
          disabled={disabled}
        />
      </Field>

      <div className="flex flex-col gap-2 text-[13px] text-muted">
        <span>
          Range seen for {describeHouseShort(used)}:{" "}
          <strong className="text-ink">
            {formatRupiah(estimate.rangeLow)}–{formatRupiah(estimate.rangeHigh)}
          </strong>
        </span>
        <span>
          Property inflation assumed{" "}
          <strong className="text-ink">{Math.round(estimate.growthRatePerYear * 100)}% / yr</strong>{" "}
          until {used.targetYear ?? "the goal year"}, so the target is{" "}
          <strong className="text-ink">{formatRupiah(estimate.targetAtGoalDate)}</strong>
        </span>
      </div>

      <span className="text-[12px] text-muted">
        Calculated {relativeTime(estimate.calculatedAt)} from: {describeHouseInputs(used)}
      </span>

      {estimate.sources.length > 0 && (
        <div className="flex flex-col gap-2 border-line border-t pt-4">
          <span className="font-bold text-[12px] text-muted uppercase tracking-[0.06em]">
            Sources
          </span>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {estimate.sources.map((source) => (
              <li key={`${source.url}-${source.title}`}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-1 text-[13px] text-ink no-underline hover:bg-page"
                >
                  <span className="min-w-0 truncate">{source.title}</span>
                  <span className="shrink-0 text-muted">{source.date}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
