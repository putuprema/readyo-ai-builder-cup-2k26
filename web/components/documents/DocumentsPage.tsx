"use client";

import type { Goal } from "@adidi/shared";
import { reusableMonth } from "@adidi/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StepChips } from "@/components/goal/StepChips";
import { RequireAuth } from "@/components/RequireAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  CARDS,
  type CardId,
  canSubmit,
  defaultMonth,
  footerLine,
  initialKind,
  monthLabel,
  monthOptions,
  readyItems,
} from "@/lib/documents";
import { goalSummary } from "@/lib/goal-summary";
import { listenGoal } from "@/lib/goals";
import { useRouteSegment } from "@/lib/route-id";
import { listSubmittedMonths, runErrorMessage, startRun } from "@/lib/runs";
import { loadSampleStatements, SAMPLE_MONTH } from "@/lib/sample";
import { apiUploader, type Uploader } from "@/lib/uploader";
import { PreviewDialog } from "./PreviewDialog";
import { UploadCard } from "./UploadCard";
import { useUploads } from "./useUploads";

// 2 · Documents (docs/screens.md): three upload cards, file rows with progress and remove,
// Submit once a bank or e-wallet statement is in. Nothing is read before Submit: files go to
// Cloud Storage through the api's signed URLs and Submit posts the run (spec 07).

const uploader: Uploader = apiUploader;

export function DocumentsPage() {
  return (
    <>
      <SiteHeader />
      <RequireAuth>
        <DocumentsStep />
      </RequireAuth>
    </>
  );
}

function DocumentsStep() {
  const router = useRouter();
  const goalId = useRouteSegment(1);
  const { state } = useAuth();
  const uid = state.user?.uid ?? null;

  const [goal, setGoal] = useState<Goal | null | undefined>(undefined);
  const [month, setMonth] = useState(() => defaultMonth());
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reusable, setReusable] = useState<string | null>(null);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const { items, rejected, add, remove, changeKind } = useUploads({
    month,
    uploader,
    onNotice: setNotice,
    previews: true,
  });

  useEffect(() => {
    if (!uid || !goalId) return;
    return listenGoal(uid, goalId, setGoal, () => setGoal(null));
  }, [uid, goalId]);

  // Spec 10, "Step 2 routing": a recent submitted month would send a second goal to the
  // reuse step. That step is M2, so for now the page says so and still takes an upload.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    listSubmittedMonths(uid)
      .then((months) => {
        if (!cancelled) setReusable(reusableMonth(months, new Date()));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uid]);

  function addFiles(card: CardId, files: File[]) {
    add(files, { group: card, card, sourceKind: (name) => initialKind(card, name) });
  }

  /**
   * Adds the four sample statements as if the person had picked them: same checks, same
   * upload path, same progress and errors. Their month is used when it is offered.
   */
  async function addSampleStatements() {
    setLoadingSamples(true);
    setNotice(null);
    try {
      const samples = await loadSampleStatements();
      const sampleMonth = monthOptions().includes(SAMPLE_MONTH) ? SAMPLE_MONTH : month;
      setMonth(sampleMonth);
      for (const { file, card, sourceKind, url } of samples) {
        add([file], { group: card, card, sourceKind, month: sampleMonth, previewUrl: url });
      }
    } catch {
      setNotice("Could not load the sample statements. Try again, or add your own files.");
    } finally {
      setLoadingSamples(false);
    }
  }

  async function submit() {
    if (!canSubmit(items) || !goalId) return;
    setSubmitting(true);
    setNotice(null);
    const documentIds = readyItems(items).flatMap((i) => (i.docId ? [i.docId] : []));
    try {
      const { runId } = await startRun({ kind: "first", goalIds: [goalId], month, documentIds });
      router.push(`/goals/${goalId}/progress/?run=${runId}`);
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

  const submitEnabled = canSubmit(items) && !submitting && goal?.status === "draft";
  const samplesEnabled =
    items.length === 0 && !loadingSamples && !submitting && goal?.status === "draft";

  return (
    <main className="mx-auto box-border flex w-full max-w-[1120px] flex-col gap-8 px-4 pt-8 pb-16 sm:px-8 sm:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold text-[13px] text-muted uppercase tracking-[0.06em]">
            Step 2 of 3{goal ? ` · ${goalSummary(goal)}` : ""}
          </span>
          <h1 className="m-0 font-extrabold text-[30px] leading-[1.15] tracking-[-0.02em] sm:text-[34px]">
            Add your last 1–2 months
          </h1>
          <p className="m-0 max-w-[600px] text-muted">
            Screenshots, PDFs and photos all work. Nothing is read until you submit; then we analyse
            everything together, keep only the structured numbers, and delete the originals.
          </p>
        </div>
        <StepChips current={2} />
      </div>

      {goal === null && (
        <p
          role="alert"
          className="m-0 rounded-[10px] bg-[#FDECEA] px-3.5 py-3 text-[13px] text-blocked"
        >
          This goal was not found.{" "}
          <Link href="/goals/new/?type=house" className="font-semibold">
            Start a new goal
          </Link>
          .
        </p>
      )}
      {goal && goal.status !== "draft" && (
        <p
          role="status"
          className="m-0 rounded-[10px] bg-[#FEF6EC] px-3.5 py-3 text-[#6B3A08] text-[13px]"
        >
          This goal is already {goal.status === "analysing" ? "being analysed" : "active"}; its
          statements were submitted.
        </p>
      )}

      {reusable && (
        <p
          role="status"
          className="m-0 rounded-[10px] bg-[#FEF6EC] px-3.5 py-3 text-[#6B3A08] text-[13px]"
        >
          Your {monthLabel(reusable)} statements are already in from another goal. Reusing them for
          a new goal is coming soon; for now, add the statements again below.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <label htmlFor="month" className="font-semibold text-[13px]">
          Statements for
        </label>
        <select
          id="month"
          value={month}
          disabled={items.length > 0}
          onChange={(e) => setMonth(e.target.value)}
          className="h-11 rounded-[10px] border border-[#C9CFC9] bg-surface px-3 text-[15px] text-ink disabled:bg-page"
        >
          {monthOptions().map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <span className="text-[13px] text-muted">
          {items.length > 0
            ? "Remove the files to change the month."
            : "The most recent full month is best; every file you add here belongs to it."}
        </span>
        <div className="flex w-full flex-wrap items-center gap-3 border-line border-t pt-3">
          <button
            type="button"
            onClick={() => void addSampleStatements()}
            disabled={!samplesEnabled}
            className="inline-flex min-h-11 items-center rounded-[10px] border border-accent bg-surface px-4 font-semibold text-[14px] text-accent-strong hover:bg-accent-tint disabled:border-[#C9CFC9] disabled:text-muted disabled:hover:bg-surface"
          >
            {loadingSamples ? "Loading samples" : "Use sample statements"}
          </button>
          <span className="text-[13px] text-muted">
            No statements at hand? Try four made-up ones for one household, September 2026: bank,
            e-wallet, PayLater and investments.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {CARDS.map((spec) => (
          <UploadCard
            key={spec.id}
            spec={spec}
            items={items.filter((i) => i.card === spec.id)}
            rejected={rejected[spec.id] ?? []}
            onFiles={(files) => addFiles(spec.id, files)}
            onRemove={(item) => void remove(item)}
            onKindChange={changeKind}
            onPreview={(item) => setPreviewing(item.localId)}
            disabled={submitting || goal?.status !== "draft"}
          />
        ))}
      </div>

      <PreviewDialog
        item={items.find((i) => i.localId === previewing) ?? null}
        onClose={() => setPreviewing(null)}
      />

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
            {footerLine(items)}
          </span>
          <span className="flex items-center gap-2 text-[13px] text-muted">
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
            Analysis starts when you submit. Originals are deleted once it finishes.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={goalId ? `/goals/new/?id=${goalId}` : "/goals/new/?type=house"}
            className="inline-flex min-h-12 items-center rounded-xl border border-[#C9CFC9] bg-surface px-5 font-semibold text-[15px] text-ink no-underline"
          >
            Back
          </Link>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!submitEnabled}
            aria-disabled={!submitEnabled}
            className="inline-flex min-h-12 items-center gap-2.5 rounded-xl bg-accent px-6 font-bold text-[15px] text-white disabled:bg-[#9BB5A6]"
          >
            {submitting ? "Submitting" : "Submit"}
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
      </div>
    </main>
  );
}
