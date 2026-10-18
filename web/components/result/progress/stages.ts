import type { RunStage, RunStatus } from "@adidi/shared";

// Copy and state for the progress view (docs/screens.md "2b"; design artboard Analyzing).
// The run document drives everything: `stage` picks the headline and the chip states,
// `percent` fills the ring and the bar. The notes carry no numbers because the run document
// has none; the result page shows the real figures.

export const PIPELINE_STAGES = ["reading", "cleaning", "checking", "planning"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface StageCopy {
  name: string;
  note: string;
  headline: string;
  detail: string;
}

export const STAGE_COPY: Record<PipelineStage, StageCopy> = {
  reading: {
    name: "Reading",
    note: "Every transaction, loan and holding in your files",
    headline: "Reading your statements",
    detail:
      "Pulling every transaction out of your bank statement, e-wallet history, PayLater bill and investment portfolio.",
  },
  cleaning: {
    name: "Cleaning up",
    note: "Transfers between your own accounts removed",
    headline: "Separating spending from moving money",
    detail:
      "A top-up from your bank to your e-wallet is not spending. Neither is salary moved to an investment app. We match these up so nothing is counted twice.",
  },
  checking: {
    name: "Checking the rules",
    note: "Seven checks against bank lending rules",
    headline: "Checking what a bank would say",
    detail:
      "Debt-to-income, down payment, emergency fund and tenor limits, simulated month by month on the cash and loan paths.",
  },
  planning: {
    name: "Building your plan",
    note: "Each action tested in the simulator",
    headline: "Testing what would get you there sooner",
    detail:
      "Trying debt pay-offs, spending caps and asset moves one by one, and keeping only the ones that actually move your date.",
  },
};

export const DONE_COPY = {
  headline: "Your readiness is ready",
  detail:
    "Your result shows the month you would be ready, what blocks a bank today, and a plan checked month by month.",
};

export const FAILED_COPY = {
  headline: "We could not finish the analysis",
  fallbackDetail: "Something went wrong while reading your statements. Please try again.",
};

export const WAITING_COPY = {
  headline: "Starting your analysis",
  detail: "Your files are queued. This page updates on its own.",
};

export type ChipState = "done" | "active" | "todo";

/** Index of a stage in the pipeline order; done is past the end, failed and unknown are -1. */
export function stageIndex(stage: RunStage): number {
  if (stage === "done") return PIPELINE_STAGES.length;
  return PIPELINE_STAGES.indexOf(stage as PipelineStage);
}

/** The state of each stage chip for a run stage. A failed run keeps every chip "to do". */
export function chipStates(stage: RunStage): ChipState[] {
  const current = stageIndex(stage);
  return PIPELINE_STAGES.map((_, i) => {
    if (current < 0) return "todo";
    if (i < current) return "done";
    if (i === current) return "active";
    return "todo";
  });
}

/** "Step N of 4" for a running stage; 4 once done; null when failed. */
export function stepNumber(stage: RunStage): number | null {
  const index = stageIndex(stage);
  if (index < 0) return null;
  return Math.min(index + 1, PIPELINE_STAGES.length);
}

export interface ProgressCopy {
  headline: string;
  detail: string;
  percent: number;
  stepNumber: number | null;
  chips: ChipState[];
  running: boolean;
  finished: boolean;
  failed: boolean;
}

/** Everything the view shows, from the run document (null while the document has not arrived). */
export function progressCopy(
  run: Pick<RunStatus, "stage" | "percent" | "error"> | null,
): ProgressCopy {
  if (!run) {
    return {
      ...WAITING_COPY,
      percent: 0,
      stepNumber: 1,
      chips: chipStates("reading"),
      running: true,
      finished: false,
      failed: false,
    };
  }
  const percent = Math.max(0, Math.min(100, Math.round(run.percent)));
  if (run.stage === "failed") {
    return {
      headline: FAILED_COPY.headline,
      detail: run.error?.trim() || FAILED_COPY.fallbackDetail,
      percent,
      stepNumber: null,
      chips: chipStates("failed"),
      running: false,
      finished: false,
      failed: true,
    };
  }
  if (run.stage === "done") {
    return {
      ...DONE_COPY,
      percent: 100,
      stepNumber: stepNumber("done"),
      chips: chipStates("done"),
      running: false,
      finished: true,
      failed: false,
    };
  }
  const copy = STAGE_COPY[run.stage];
  return {
    headline: copy.headline,
    detail: copy.detail,
    percent,
    stepNumber: stepNumber(run.stage),
    chips: chipStates(run.stage),
    running: true,
    finished: false,
    failed: false,
  };
}
