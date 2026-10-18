"use client";

import type { RunStatus } from "@adidi/shared";
import { useEffect, useState } from "react";
import { PIPELINE_STAGES } from "./stages";

// A run document that walks through the four stages on a timer, so the view can be built and
// checked before the Firestore listener exists (specs/11-ui-progress-result.md, task 1). The
// percents are the ones the worker writes when it enters each stage (specs/07-pipeline-runs.md).
// `?stage=failed` (or any stage name) freezes the fake run at that stage.

const STAGE_PERCENT: Record<string, number> = {
  reading: 18,
  cleaning: 42,
  checking: 71,
  planning: 92,
  done: 100,
};

const STEP_MS = 2600;

function fakeRun(goalId: string, stage: RunStatus["stage"], percent: number): RunStatus {
  return {
    id: "fake-run",
    stage,
    percent,
    startedAt: new Date().toISOString(),
    goalIds: [goalId],
    month: "2026-09",
    kind: "first",
    ...(stage === "failed"
      ? {
          error:
            "The bank statement could not be read. Check that the PDF is not a scan of a screen, then upload it again.",
        }
      : {}),
  };
}

export function useFakeRun(goalId: string | null): RunStatus | null {
  const [run, setRun] = useState<RunStatus | null>(null);

  useEffect(() => {
    if (!goalId) return;
    const forced = new URLSearchParams(window.location.search).get("stage");
    if (forced && (forced === "failed" || forced in STAGE_PERCENT)) {
      setRun(fakeRun(goalId, forced as RunStatus["stage"], STAGE_PERCENT[forced] ?? 18));
      return;
    }
    const sequence: RunStatus["stage"][] = [...PIPELINE_STAGES, "done"];
    let step = 0;
    setRun(fakeRun(goalId, "reading", 0));
    const timer = setInterval(() => {
      const stage = sequence[step];
      if (!stage) {
        clearInterval(timer);
        return;
      }
      setRun(fakeRun(goalId, stage, STAGE_PERCENT[stage] ?? 0));
      step += 1;
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [goalId]);

  return run;
}
