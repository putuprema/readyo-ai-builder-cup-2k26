import type { Goal, RunStatus } from "@adidi/shared";
import { hasUndefined } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { ExtractionStageError } from "../extraction/stage.js";
import { GENERIC_FAILURE_MESSAGE, PipelineError } from "./errors.js";
import { FakeRunStore } from "./fakes.js";
import { type KindRunner, runPipeline } from "./runner.js";

// specs/07-pipeline-runs.md task 2: stage updates in order, success marks the goals active,
// failure restores them and stores a user-readable error, retries follow the attempt rule.

const NOW = new Date("2026-10-18T10:00:00.000Z");

const goal: Goal = {
  id: "g1",
  type: "house",
  status: "analysing",
  draftStep: "documents",
  payPreference: "loan",
  inputs: {
    area: "Tangerang Selatan",
    propertyType: "landed",
    market: "new",
    firstHome: true,
    targetYear: 2028,
  },
  createdAt: "2026-10-17T00:00:00.000Z",
  updatedAt: "2026-10-17T00:00:00.000Z",
};

function run(overrides: Partial<RunStatus> = {}): RunStatus {
  return {
    id: "run_1",
    stage: "reading",
    percent: 0,
    startedAt: "2026-10-18T09:59:00.000Z",
    goalIds: ["g1"],
    month: "2026-09",
    kind: "first",
    documentIds: ["d1"],
    goalStatusBefore: { g1: "draft" },
    attempt: 0,
    ...overrides,
  };
}

function setup(runner: KindRunner, runOverrides: Partial<RunStatus> = {}) {
  const store = new FakeRunStore();
  store.runs.set("run_1", run(runOverrides));
  store.goals.set("g1", goal);
  const logs: string[] = [];
  const deps = {
    store,
    runners: { first: runner },
    now: () => NOW,
    log: (m: string) => logs.push(m),
  };
  return { store, logs, deps };
}

const task = { uid: "u1", runId: "run_1" };

describe("runPipeline", () => {
  it("writes the stages in order, then done with the goal active", async () => {
    const { store, deps } = setup(async (ctx) => {
      await ctx.enter("reading");
      await ctx.enter("cleaning");
      await ctx.enter("checking");
      await ctx.enter("planning");
      ctx.note("g1", { toolCalls: 3, stoppedBecause: "model_done", warnings: [] });
    });

    const outcome = await runPipeline(task, 0, deps);

    expect(outcome).toEqual({ status: 200, body: { ok: true, runId: "run_1", stage: "done" } });
    expect(store.stagesSeen()).toEqual(["reading", "cleaning", "checking", "planning", "done"]);
    expect(store.runPatches.map((p) => p.percent).filter((p) => p !== undefined)).toEqual([
      18, 42, 71, 92, 100,
    ]);
    const final = store.runs.get("run_1");
    expect(final).toMatchObject({
      stage: "done",
      percent: 100,
      attempt: 1,
      finishedAt: NOW.toISOString(),
      goals: { g1: { toolCalls: 3 } },
    });
    expect(hasUndefined(final)).toBe(false);
    expect(store.goals.get("g1")).toMatchObject({
      status: "active",
      latestAnalysisMonth: "2026-09",
    });
  });

  it("fails with the user-readable message and puts the goal back to draft", async () => {
    const { store, deps } = setup(async (ctx) => {
      await ctx.enter("reading");
      throw new PipelineError("We could not read your bank statement.");
    });

    const outcome = await runPipeline(task, 0, deps);

    expect(outcome.status).toBe(200);
    expect(outcome.body).toMatchObject({ ok: false, stage: "failed" });
    expect(store.runs.get("run_1")).toMatchObject({
      stage: "failed",
      error: "We could not read your bank statement.",
      finishedAt: NOW.toISOString(),
    });
    expect(store.goals.get("g1")).toMatchObject({ status: "draft", draftStep: "documents" });
  });

  it("treats an extraction stop the same way", async () => {
    const { store, deps } = setup(async () => {
      throw new ExtractionStageError("We could not read any of the uploaded files.", []);
    });
    await runPipeline(task, 0, deps);
    expect(store.runs.get("run_1")?.error).toMatch(/could not read/);
  });

  it("restores an active goal to active when a monthly run fails", async () => {
    const { store, deps } = setup(
      async () => {
        throw new PipelineError("nope");
      },
      { kind: "monthly", goalStatusBefore: { g1: "active" } },
    );
    deps.runners = { monthly: deps.runners.first };
    await runPipeline(task, 0, deps);
    expect(store.goals.get("g1")?.status).toBe("active");
  });

  it("asks Cloud Tasks for a retry on an unexpected error, leaving the stage as it was", async () => {
    const { store, deps } = setup(async (ctx) => {
      await ctx.enter("cleaning");
      throw new TypeError("boom");
    });

    const outcome = await runPipeline(task, 0, deps);

    expect(outcome.status).toBe(500);
    expect(store.runs.get("run_1")).toMatchObject({ stage: "cleaning", attempt: 1 });
    expect(store.runs.get("run_1")?.error).toBeUndefined();
    expect(store.goals.get("g1")?.status).toBe("analysing");
  });

  it("gives up with a generic message on the last attempt", async () => {
    const { store, deps } = setup(async () => {
      throw new TypeError("boom");
    });

    const outcome = await runPipeline(task, 2, deps);

    expect(outcome.status).toBe(200);
    expect(store.runs.get("run_1")).toMatchObject({
      stage: "failed",
      error: GENERIC_FAILURE_MESSAGE,
      attempt: 3,
    });
    expect(store.goals.get("g1")?.status).toBe("draft");
  });

  it("does nothing for a run that is already done or failed", async () => {
    let calls = 0;
    const { store, deps } = setup(
      async () => {
        calls++;
      },
      { stage: "done", percent: 100 },
    );
    expect(await runPipeline(task, 1, deps)).toEqual({
      status: 200,
      body: { ok: true, runId: "run_1", stage: "done" },
    });
    store.runs.set("run_1", run({ stage: "failed", error: "x" }));
    expect((await runPipeline(task, 1, deps)).status).toBe(200);
    expect(calls).toBe(0);
    expect(store.runPatches).toEqual([]);
  });

  it("ignores a missing run document without asking for a retry", async () => {
    const { deps } = setup(async () => {});
    expect(await runPipeline({ uid: "u1", runId: "nope" }, 0, deps)).toEqual({
      status: 200,
      body: { ok: false, runId: "nope", reason: "run_not_found" },
    });
  });

  it("fails a kind that has no runner", async () => {
    const { store, deps } = setup(async () => {}, { kind: "recalculate" });
    const outcome = await runPipeline(task, 0, deps);
    expect(outcome.body.reason).toBe("kind_unsupported");
    expect(store.runs.get("run_1")?.stage).toBe("failed");
  });
});
