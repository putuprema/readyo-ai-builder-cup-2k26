"use client";

import type { Estimate, EstimateResponse } from "@adidi/shared";
import { formatRupiahInput, parseRupiahInput } from "@adidi/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { SiteHeader } from "@/components/SiteHeader";
import {
  canContinue,
  defaultHouseForm,
  type FormErrors,
  type HouseFormValues,
  isEstimateStale,
  toHouseInputs,
} from "@/lib/house-form";
import { mockEstimateHouse } from "@/lib/mock-estimate";
import { EstimateCard, type EstimateState } from "./EstimateCard";
import { GoalPicker } from "./GoalPicker";
import { HouseForm } from "./HouseForm";
import { StepChips } from "./StepChips";

// 1 · New goal (house). Mock estimate for now (task 3); the api and the draft are wired in
// task 5. The estimate is never calculated on input change, only on the button.

export function NewGoalPage() {
  const router = useRouter();
  const [values, setValues] = useState<HouseFormValues>(() => defaultHouseForm());
  const [errors, setErrors] = useState<FormErrors>({});
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [phase, setPhase] = useState<"empty" | "loading" | "failed" | "ready">("empty");
  const [failure, setFailure] = useState<string>("");
  const [priceText, setPriceText] = useState("");
  const [dirty, setDirty] = useState(false);

  const current = useMemo(() => toHouseInputs(values), [values]);
  const stale = estimate !== null && (!current.ok || isEstimateStale(current.inputs, estimate));
  const typedPrice = parseRupiahInput(priceText);
  const override =
    typedPrice !== null && typedPrice > 0 && typedPrice !== estimate?.targetToday
      ? typedPrice
      : null;
  const continueEnabled = canContinue(estimate, override) && phase !== "loading";

  // Leaving with unsaved changes asks for confirmation (spec 10, "Draft saving").
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const onChange = useCallback((patch: Partial<HouseFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const key of Object.keys(patch) as (keyof HouseFormValues)[]) delete next[key];
      return next;
    });
    setDirty(true);
  }, []);

  async function calculate() {
    const mapped = toHouseInputs(values);
    if (!mapped.ok) {
      setErrors(mapped.errors);
      return;
    }
    setErrors({});
    setPhase("loading");
    let response: EstimateResponse;
    try {
      response = await mockEstimateHouse(mapped.inputs);
    } catch {
      response = {
        targetToday: null,
        message: "The price search did not answer. Try again in a moment, or type a price.",
      };
    }
    if (response.targetToday === null) {
      setEstimate(null);
      setFailure(response.message);
      setPhase("failed");
      return;
    }
    setEstimate(response);
    setPriceText(formatRupiahInput(response.targetToday));
    setPhase("ready");
    setDirty(true);
  }

  const estimateState: EstimateState =
    phase === "loading"
      ? { kind: "loading" }
      : phase === "failed"
        ? { kind: "failed", message: failure }
        : phase === "ready" && estimate
          ? { kind: "ready", estimate, stale }
          : { kind: "empty" };

  function saveDraft() {
    setDirty(false);
    router.push("/");
  }

  function continueToDocuments() {
    if (!continueEnabled) return;
    setDirty(false);
    router.push("/goals/mock/documents/");
  }

  return (
    <>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto box-border flex w-full max-w-[1120px] flex-col gap-8 px-4 pt-8 pb-16 sm:px-8 sm:pt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="font-semibold text-[13px] text-muted uppercase tracking-[0.06em]">
                Step 1 of 3
              </span>
              <h1 className="m-0 font-extrabold text-[30px] leading-[1.15] tracking-[-0.02em] sm:text-[34px]">
                Create a goal
              </h1>
              <p className="m-0 max-w-[560px] text-muted">
                Pick what you are saving for and tell us the few details that change the price.
                Everything else gets a default you can edit later.
              </p>
            </div>
            <StepChips current={1} />
          </div>

          <GoalPicker selected="house" />

          <div className="flex flex-wrap items-start gap-8">
            <HouseForm
              values={values}
              errors={errors}
              onChange={onChange}
              onCalculate={() => void calculate()}
              calculating={phase === "loading"}
            />
            <EstimateCard
              state={estimateState}
              price={priceText}
              onPriceChange={(text) => {
                setPriceText(text);
                setDirty(true);
              }}
              onRecalculate={() => void calculate()}
              disabled={phase === "loading"}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-line border-t pt-6">
            <Link
              href="/"
              onClick={(e) => {
                e.preventDefault();
                saveDraft();
              }}
              className="inline-flex min-h-12 items-center rounded-xl border border-[#C9CFC9] bg-surface px-5 font-semibold text-[15px] text-ink no-underline"
            >
              Save draft
            </Link>
            <button
              type="button"
              onClick={continueToDocuments}
              disabled={!continueEnabled}
              aria-disabled={!continueEnabled}
              className="inline-flex min-h-12 items-center gap-2.5 rounded-xl bg-accent px-6 font-bold text-[15px] text-white disabled:bg-[#9BB5A6]"
            >
              Continue to documents
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
            </button>
          </div>
        </main>
      </RequireAuth>
    </>
  );
}
