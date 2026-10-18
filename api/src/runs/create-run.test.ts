import type { DocumentRecord, Goal } from "@adidi/shared";
import { hasUndefined } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { FakeRunStore, FakeTaskQueue } from "./fakes.js";

// POST /runs against the fakes (specs/07-pipeline-runs.md, task 1): the run document is
// written with stage `reading` and percent 0, the goals become `analysing`, one task is
// enqueued with { uid, runId }, and the checks on goals, months and documents.

const NOW = new Date("2026-10-18T09:30:00.000Z");

const draft: Goal = {
  id: "g1",
  type: "house",
  status: "draft",
  draftStep: "documents",
  payPreference: "loan",
  inputs: {
    area: "Tangerang Selatan",
    propertyType: "landed",
    market: "new",
    firstHome: true,
    targetYear: 2028,
  },
  estimate: {
    targetToday: 1_350_000_000,
    rangeLow: 1_100_000_000,
    rangeHigh: 1_600_000_000,
    growthRatePerYear: 0.06,
    targetAtGoalDate: 1_516_860_000,
    sources: [],
    inputsUsed: {},
    calculatedAt: "2026-10-17T00:00:00.000Z",
  },
  createdAt: "2026-10-17T00:00:00.000Z",
  updatedAt: "2026-10-17T00:00:00.000Z",
};

const active: Goal = { ...draft, id: "g2", status: "active", latestAnalysisMonth: "2026-09" };

const bankDoc: DocumentRecord = {
  id: "d1",
  name: "bank.pdf",
  type: "application/pdf",
  size: 1000,
  sourceKind: "bank",
  month: "2026-09",
  status: "uploaded",
  createdAt: "2026-10-18T09:00:00.000Z",
};

function setup(queue = new FakeTaskQueue()) {
  const store = new FakeRunStore()
    .addGoal("u1", draft)
    .addGoal("u1", active)
    .addDocument("u1", bankDoc)
    .addMonth("u1", "2026-09");
  const app = createApp({
    verifyToken: async (token) =>
      token === "u1" ? { uid: "u1" } : token === "u2" ? { uid: "u2" } : null,
    log: false,
    runs: { store, queue, now: () => NOW, newRunId: () => "run_test" },
  });
  const post = (body: unknown, token = "u1") =>
    app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  return { app, post, store, queue };
}

describe("POST /runs", () => {
  it("creates the run, marks the goal analysing and enqueues one task", async () => {
    const { post, store, queue } = setup();
    const res = await post({
      kind: "first",
      goalIds: ["g1"],
      month: "2026-09",
      documentIds: ["d1"],
    });

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ runId: "run_test" });
    const run = store.runs.get("u1/run_test");
    expect(run).toMatchObject({
      id: "run_test",
      stage: "reading",
      percent: 0,
      startedAt: NOW.toISOString(),
      goalIds: ["g1"],
      month: "2026-09",
      kind: "first",
      documentIds: ["d1"],
      goalStatusBefore: { g1: "draft" },
      attempt: 0,
    });
    expect(hasUndefined(run)).toBe(false);
    expect(store.goals.get("u1/g1")?.status).toBe("analysing");
    expect(queue.tasks).toEqual([{ uid: "u1", runId: "run_test" }]);
  });

  it("accepts a reuse run for a recent month without documents", async () => {
    const { post, store } = setup();
    const res = await post({ kind: "reuse", goalIds: ["g1"], month: "2026-09" });
    expect(res.status).toBe(202);
    expect(store.runs.get("u1/run_test")?.documentIds).toBeUndefined();
  });

  it("refuses a reuse run for a month that was never submitted", async () => {
    const { post } = setup();
    const res = await post({ kind: "reuse", goalIds: ["g1"], month: "2026-08" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "month_missing" });
  });

  it("refuses a reuse run once the month is older than 45 days", async () => {
    const store = new FakeRunStore().addGoal("u1", draft).addMonth("u1", "2026-09");
    const app = createApp({
      verifyToken: async () => ({ uid: "u1" }),
      log: false,
      runs: {
        store,
        queue: new FakeTaskQueue(),
        now: () => new Date("2026-11-20T00:00:00.000Z"),
      },
    });
    const res = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer x" },
      body: JSON.stringify({ kind: "reuse", goalIds: ["g1"], month: "2026-09" }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "month_too_old" });
  });

  it("accepts a monthly run for active goals", async () => {
    const { post, store } = setup();
    const res = await post({
      kind: "monthly",
      goalIds: ["g2"],
      month: "2026-10",
      documentIds: ["d1"],
    });
    expect(res.status).toBe(202);
    expect(store.runs.get("u1/run_test")?.goalStatusBefore).toEqual({ g2: "active" });
  });

  it("refuses a first run on an active goal and a monthly run on a draft", async () => {
    const { post } = setup();
    const first = await post({
      kind: "first",
      goalIds: ["g2"],
      month: "2026-09",
      documentIds: ["d1"],
    });
    expect(first.status).toBe(409);
    expect(await first.json()).toMatchObject({ error: "goal_status" });
    const monthly = await post({ kind: "monthly", goalIds: ["g1"], month: "2026-10" });
    expect(monthly.status).toBe(409);
  });

  it("refuses a goal that is already analysing", async () => {
    const { post, store } = setup();
    store.addGoal("u1", { ...draft, id: "g3", status: "analysing" });
    const res = await post({
      kind: "first",
      goalIds: ["g3"],
      month: "2026-09",
      documentIds: ["d1"],
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "goal_analysing" });
  });

  it("refuses a goal without an estimate", async () => {
    const { post, store } = setup();
    const { estimate: _estimate, ...unpriced } = draft;
    store.addGoal("u1", { ...unpriced, id: "g4" });
    const res = await post({
      kind: "first",
      goalIds: ["g4"],
      month: "2026-09",
      documentIds: ["d1"],
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "goal_not_priced" });
  });

  it("answers 404 for a missing goal, another user's goal or a missing document", async () => {
    const { post, store, queue } = setup();
    expect(
      (await post({ kind: "first", goalIds: ["nope"], month: "2026-09", documentIds: ["d1"] }))
        .status,
    ).toBe(404);
    expect(
      (await post({ kind: "first", goalIds: ["g1"], month: "2026-09", documentIds: ["d1"] }, "u2"))
        .status,
    ).toBe(404);
    expect(
      (await post({ kind: "first", goalIds: ["g1"], month: "2026-09", documentIds: ["d9"] }))
        .status,
    ).toBe(404);
    expect(store.goals.get("u1/g1")?.status).toBe("draft");
    expect(queue.tasks).toEqual([]);
  });

  it("rolls the goal back and marks the run failed when the queue is down", async () => {
    const { post, store } = setup(new FakeTaskQueue(new Error("queue down")));
    const res = await post({
      kind: "first",
      goalIds: ["g1"],
      month: "2026-09",
      documentIds: ["d1"],
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "queue_unavailable" });
    expect(store.goals.get("u1/g1")?.status).toBe("draft");
    expect(store.runs.get("u1/run_test")).toMatchObject({ stage: "failed" });
    expect(store.runs.get("u1/run_test")?.error).toMatch(/try again/);
  });

  it("answers 501 when runs are not configured", async () => {
    const app = createApp({ verifyToken: async () => ({ uid: "u1" }), log: false });
    const res = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer x" },
      body: JSON.stringify({
        kind: "first",
        goalIds: ["g1"],
        month: "2026-09",
        documentIds: ["d1"],
      }),
    });
    expect(res.status).toBe(501);
  });
});
