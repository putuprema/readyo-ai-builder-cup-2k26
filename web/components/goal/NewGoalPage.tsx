"use client";

import type { Estimate, EstimateResponse, Goal, HouseInputs, Profile } from "@adidi/shared";
import { formatRupiahInput, parseRupiahInput } from "@adidi/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { createDraft, estimateGoal, houseInputsPatch, loadGoal, patchGoal } from "@/lib/goals";
import {
  canContinue,
  type FormErrors,
  type HouseFormValues,
  houseFormFromInputs,
  isEstimateStale,
  sampleHouseForm,
  toHouseInputs,
} from "@/lib/house-form";
import { loadProfile, saveProfile } from "@/lib/profile";
import { SAMPLE_NOTE, SAMPLE_PROFILE, SAMPLE_PROFILE_NOTE } from "@/lib/sample";
import { EstimateCard, type EstimateState } from "./EstimateCard";
import { GoalPicker } from "./GoalPicker";
import { HouseForm } from "./HouseForm";
import { ProfileModal } from "./ProfileModal";
import { StepChips } from "./StepChips";

// 1 · New goal (house). The draft is created on the first Calculate Estimate or Save draft
// (POST /goals), the estimate comes from POST /goals/:id/estimate with the on-screen values,
// and Save draft / Continue PATCH the draft. `?id=` resumes a saved draft. The estimate is
// never calculated on input change, only on the button.

export function NewGoalPage() {
  return (
    <>
      <SiteHeader />
      <RequireAuth>
        <Suspense fallback={null}>
          <NewGoalForm />
        </Suspense>
      </RequireAuth>
    </>
  );
}

type Phase = "empty" | "loading" | "failed" | "ready";

function NewGoalForm() {
  const router = useRouter();
  const params = useSearchParams();
  const resumeId = params.get("id");
  const { state } = useAuth();
  const uid = state.user?.uid ?? null;

  const [goalId, setGoalId] = useState<string | null>(null);
  const [resuming, setResuming] = useState(Boolean(resumeId));
  // A new goal starts from the sample scenario; a resumed draft replaces it with its own values.
  const [values, setValues] = useState<HouseFormValues>(() => sampleHouseForm());
  const [isSample, setIsSample] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [phase, setPhase] = useState<Phase>("empty");
  const [failure, setFailure] = useState("");
  const [priceText, setPriceText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<"draft" | "continue" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Resume a saved draft.
  useEffect(() => {
    if (!resumeId || !uid) return;
    let cancelled = false;
    loadGoal(uid, resumeId)
      .then((goal) => {
        if (cancelled) return;
        if (goal?.type !== "house") {
          setNotice("That draft was not found. Starting a new goal.");
          setResuming(false);
          return;
        }
        setGoalId(goal.id);
        setValues(houseFormFromInputs(goal.inputs as HouseInputs, goal.payPreference));
        setIsSample(false);
        if (goal.estimate) {
          setEstimate(goal.estimate);
          setPriceText(formatRupiahInput(goal.estimate.userOverride ?? goal.estimate.targetToday));
          setPhase("ready");
        }
        setDirty(false);
        setResuming(false);
      })
      .catch(() => {
        if (cancelled) return;
        setNotice("Could not load the draft. Starting a new goal.");
        setResuming(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resumeId, uid]);

  const current = useMemo(() => toHouseInputs(values), [values]);
  const stale = estimate !== null && (!current.ok || isEstimateStale(current.inputs, estimate));
  const typedPrice = parseRupiahInput(priceText);
  const override =
    typedPrice !== null && typedPrice > 0 && typedPrice !== estimate?.targetToday
      ? typedPrice
      : null;
  const busy = phase === "loading" || saving !== null || resuming;
  const continueEnabled = canContinue(estimate, override) && !busy;

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

  function validated(): HouseInputs | null {
    const mapped = toHouseInputs(values);
    if (!mapped.ok) {
      setErrors(mapped.errors);
      return null;
    }
    setErrors({});
    return mapped.inputs;
  }

  /** The draft's id, creating the draft on first use. */
  async function ensureDraft(inputs: HouseInputs): Promise<string> {
    if (goalId) return goalId;
    const goal = await createDraft({
      type: "house",
      payPreference: values.payPreference,
      inputs,
    });
    setGoalId(goal.id);
    return goal.id;
  }

  async function calculate() {
    const inputs = validated();
    if (!inputs) return;
    setNotice(null);
    setPhase("loading");
    try {
      const id = await ensureDraft(inputs);
      const response: EstimateResponse = await estimateGoal(id, "house", inputs);
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
    } catch (error) {
      setEstimate(null);
      setFailure(
        error instanceof ApiError && error.status === 501
          ? "Price search is not available on this server. Type the price you have in mind to continue."
          : messageOf(error, "The price search did not answer. Try again, or type a price."),
      );
      setPhase("failed");
    }
  }

  /** Saves inputs, preference and the typed price; returns the goal (or null on failure). */
  async function save(draftStep?: "documents"): Promise<Goal | null> {
    const inputs = validated();
    if (!inputs) return null;
    setNotice(null);
    try {
      const id = await ensureDraft(inputs);
      const storedOverride = estimate?.userOverride ?? null;
      const goal = await patchGoal(id, {
        inputs: houseInputsPatch(inputs),
        payPreference: values.payPreference,
        ...(override !== storedOverride ? { userOverride: override } : {}),
        ...(draftStep ? { draftStep } : {}),
      });
      if (goal.estimate && phase === "ready") setEstimate(goal.estimate);
      setDirty(false);
      return goal;
    } catch (error) {
      setNotice(messageOf(error, "Could not save the draft. Try again."));
      return null;
    }
  }

  async function saveDraft() {
    setSaving("draft");
    const goal = await save();
    setSaving(null);
    if (goal) router.push("/goals/");
  }

  async function continueToDocuments() {
    if (!continueEnabled || !uid) return;
    setSaving("continue");
    const goal = await save("documents");
    if (!goal) {
      setSaving(null);
      return;
    }
    let profile: Profile | null = null;
    try {
      profile = await loadProfile(uid);
    } catch {
      profile = null;
    }
    setSaving(null);
    if (!profile) {
      setProfileOpen(true);
      return;
    }
    router.push(`/goals/${goal.id}/documents/`);
  }

  async function onProfileSave(profile: Profile) {
    if (!uid || !goalId) return;
    setProfileBusy(true);
    setProfileError(null);
    try {
      await saveProfile(uid, profile);
      setProfileOpen(false);
      router.push(`/goals/${goalId}/documents/`);
    } catch (error) {
      setProfileError(messageOf(error, "Could not save your profile. Try again."));
    } finally {
      setProfileBusy(false);
    }
  }

  const estimateState: EstimateState =
    phase === "loading"
      ? { kind: "loading" }
      : phase === "failed"
        ? { kind: "failed", message: failure }
        : phase === "ready" && estimate
          ? { kind: "ready", estimate, stale }
          : { kind: "empty" };

  return (
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

      <GoalPicker selected="house" disabled={goalId !== null} />

      {resuming ? (
        <p className="m-0 text-muted" aria-busy="true">
          Loading your draft
        </p>
      ) : (
        <div className="flex flex-wrap items-start gap-8">
          <HouseForm
            values={values}
            errors={errors}
            onChange={onChange}
            onCalculate={() => void calculate()}
            calculating={phase === "loading"}
            disabled={saving !== null}
            sampleNote={isSample ? SAMPLE_NOTE : undefined}
          />
          <EstimateCard
            state={estimateState}
            price={priceText}
            onPriceChange={(text) => {
              setPriceText(text);
              setDirty(true);
            }}
            onRecalculate={() => void calculate()}
            disabled={busy}
          />
        </div>
      )}

      {notice && (
        <p
          role="alert"
          className="m-0 rounded-[10px] bg-[#FDECEA] px-3.5 py-3 text-[13px] text-blocked"
        >
          {notice}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 border-line border-t pt-6">
        <Link
          href="/goals/"
          onClick={(e) => {
            e.preventDefault();
            void saveDraft();
          }}
          aria-disabled={busy}
          className="inline-flex min-h-12 items-center rounded-xl border border-[#C9CFC9] bg-surface px-5 font-semibold text-[15px] text-ink no-underline aria-disabled:opacity-60"
        >
          {saving === "draft" ? "Saving" : "Save draft"}
        </Link>
        <button
          type="button"
          onClick={() => void continueToDocuments()}
          disabled={!continueEnabled}
          aria-disabled={!continueEnabled}
          className="inline-flex min-h-12 items-center gap-2.5 rounded-xl bg-accent px-6 font-bold text-[15px] text-white disabled:bg-[#9BB5A6]"
        >
          {saving === "continue" ? "Saving" : "Continue to documents"}
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

      <ProfileModal
        open={profileOpen}
        initial={SAMPLE_PROFILE}
        sampleNote={SAMPLE_PROFILE_NOTE}
        busy={profileBusy}
        error={profileError}
        onSave={(profile) => void onProfileSave(profile)}
        onCancel={() => setProfileOpen(false)}
      />
    </main>
  );
}

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.code === "invalid_request" && error.issues?.length) {
      return `${fallback} (${error.issues.map((i) => `${i.path}: ${i.message}`).join("; ")})`;
    }
    return error.message || fallback;
  }
  return fallback;
}
