import type { RunStage } from "@adidi/shared";

// Progress reported to the run document after each stage completes (specs/07-pipeline-runs.md).
export const STAGE_PERCENT: Record<RunStage, number> = {
  reading: 18,
  cleaning: 42,
  checking: 71,
  planning: 92,
  done: 100,
  failed: 0,
};
