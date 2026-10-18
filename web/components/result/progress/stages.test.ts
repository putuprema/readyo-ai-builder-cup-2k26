import { describe, expect, it } from "vitest";
import { chipStates, PIPELINE_STAGES, progressCopy, STAGE_COPY, stepNumber } from "./stages";

describe("chipStates", () => {
  it("marks earlier stages done, the current one active, the rest to do", () => {
    expect(chipStates("reading")).toEqual(["active", "todo", "todo", "todo"]);
    expect(chipStates("checking")).toEqual(["done", "done", "active", "todo"]);
    expect(chipStates("done")).toEqual(["done", "done", "done", "done"]);
  });
  it("keeps every chip to do when the run failed", () => {
    expect(chipStates("failed")).toEqual(["todo", "todo", "todo", "todo"]);
  });
});

describe("progressCopy", () => {
  it("follows the stage and the percent of the run document", () => {
    for (const [i, stage] of PIPELINE_STAGES.entries()) {
      const copy = progressCopy({ stage, percent: 10 * (i + 1) });
      expect(copy.headline).toBe(STAGE_COPY[stage].headline);
      expect(copy.stepNumber).toBe(i + 1);
      expect(copy.percent).toBe(10 * (i + 1));
      expect(copy.running).toBe(true);
      expect(copy.finished).toBe(false);
    }
  });
  it("is finished at 100% when done, whatever percent the document says", () => {
    const copy = progressCopy({ stage: "done", percent: 92 });
    expect(copy.finished).toBe(true);
    expect(copy.running).toBe(false);
    expect(copy.percent).toBe(100);
    expect(copy.stepNumber).toBe(4);
  });
  it("shows the run's own error sentence when failed, with a fallback", () => {
    const failed = progressCopy({
      stage: "failed",
      percent: 18,
      error: "The bank statement could not be read.",
    });
    expect(failed.failed).toBe(true);
    expect(failed.detail).toBe("The bank statement could not be read.");
    expect(failed.stepNumber).toBeNull();
    expect(progressCopy({ stage: "failed", percent: 0 }).detail).toMatch(/try again/);
  });
  it("shows a waiting state before the run document arrives", () => {
    const copy = progressCopy(null);
    expect(copy.percent).toBe(0);
    expect(copy.running).toBe(true);
    expect(copy.chips).toEqual(["active", "todo", "todo", "todo"]);
  });
  it("clamps the percent to 0..100", () => {
    expect(progressCopy({ stage: "reading", percent: -5 }).percent).toBe(0);
    expect(progressCopy({ stage: "planning", percent: 140 }).percent).toBe(100);
  });
});

describe("stepNumber", () => {
  it("counts 1 to 4 and null when failed", () => {
    expect(stepNumber("reading")).toBe(1);
    expect(stepNumber("planning")).toBe(4);
    expect(stepNumber("done")).toBe(4);
    expect(stepNumber("failed")).toBeNull();
  });
});
