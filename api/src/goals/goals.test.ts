import type { Goal } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { FakeGoalWriteStore } from "./fakes.js";

// POST /goals, PATCH /goals/:id and DELETE /goals/:id end to end against the fake store
// (specs/01-contracts.md endpoints, wired by spec 10).

const NOW = new Date("2026-10-18T09:30:00.000Z");

const houseInputs = {
  area: "Serpong",
  propertyType: "landed" as const,
  landM2: 90,
  buildingM2: 70,
  market: "new" as const,
  firstHome: true,
  targetYear: 2028,
};

const draft: Goal = {
  id: "g1",
  type: "house",
  status: "draft",
  draftStep: "estimate",
  payPreference: "loan",
  inputs: houseInputs,
  createdAt: "2026-10-17T00:00:00.000Z",
  updatedAt: "2026-10-17T00:00:00.000Z",
};

const priced: Goal = {
  ...draft,
  id: "g2",
  estimate: {
    targetToday: 1_350_000_000,
    rangeLow: 1_100_000_000,
    rangeHigh: 1_600_000_000,
    growthRatePerYear: 0.06,
    targetAtGoalDate: 1_516_860_000,
    sources: [{ title: "A", url: "https://a.example", date: "2026-10" }],
    inputsUsed: { ...houseInputs },
    calculatedAt: "2026-10-17T00:00:00.000Z",
  },
};

function setup(store = new FakeGoalWriteStore().addGoal("u1", draft).addGoal("u1", priced)) {
  let n = 0;
  const app = createApp({
    verifyToken: async (token) =>
      token === "u1" ? { uid: "u1" } : token === "u2" ? { uid: "u2" } : null,
    log: false,
    goals: { store, now: () => NOW, newGoalId: () => `goal_${++n}` },
  });
  const call = (method: string, path: string, body?: unknown, token = "u1") =>
    app.request(path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { app, call, store };
}

describe("POST /goals", () => {
  it("creates a draft at the estimate step and returns it", async () => {
    const { call, store } = setup();
    const res = await call("POST", "/goals", {
      type: "house",
      payPreference: "loan",
      inputs: houseInputs,
    });
    expect(res.status).toBe(201);
    const goal = (await res.json()) as Goal;
    expect(goal).toMatchObject({
      id: "goal_1",
      type: "house",
      status: "draft",
      draftStep: "estimate",
      payPreference: "loan",
      inputs: houseInputs,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect(goal.estimate).toBeUndefined();
    expect(await store.getGoal("u1", "goal_1")).toEqual(goal);
  });
});

describe("PATCH /goals/:id", () => {
  it("merges partial inputs and validates the result against the goal's type", async () => {
    const { call, store } = setup();
    const res = await call("PATCH", "/goals/g1", { inputs: { buildingM2: 80, plannedDp: 1 } });
    expect(res.status).toBe(200);
    const goal = (await res.json()) as Goal;
    expect(goal.inputs).toEqual({ ...houseInputs, buildingM2: 80, plannedDp: 1 });
    expect(goal.updatedAt).toBe(NOW.toISOString());
    expect((await store.getGoal("u1", "g1"))?.inputs).toEqual(goal.inputs);
  });

  it("rejects inputs of another goal type with 400", async () => {
    const { call } = setup();
    const res = await call("PATCH", "/goals/g1", { inputs: { condition: "new" } });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { issues: { path: string }[] };
    expect(body.issues[0]?.path.startsWith("inputs")).toBe(true);
  });

  it("moves a draft to the documents step and changes the pay preference", async () => {
    const { call } = setup();
    const res = await call("PATCH", "/goals/g1", { draftStep: "documents", payPreference: "cash" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ draftStep: "documents", payPreference: "cash" });
  });

  it("stores and clears the user's own price on a priced goal", async () => {
    const { call, store } = setup();
    const set = await call("PATCH", "/goals/g2", { userOverride: 1_200_000_000 });
    expect(set.status).toBe(200);
    expect((await set.json()).estimate).toMatchObject({
      targetToday: 1_350_000_000,
      userOverride: 1_200_000_000,
    });
    const clear = await call("PATCH", "/goals/g2", { userOverride: null });
    expect(clear.status).toBe(200);
    const stored = await store.getGoal("u1", "g2");
    expect(stored?.estimate?.userOverride).toBeUndefined();
    expect(stored?.estimate?.targetToday).toBe(1_350_000_000);
  });

  it("turns a typed price without an AI estimate into a source-less estimate", async () => {
    const { call } = setup();
    const res = await call("PATCH", "/goals/g1", { userOverride: 1_000_000_000 });
    expect(res.status).toBe(200);
    const goal = (await res.json()) as Goal;
    expect(goal.estimate).toMatchObject({
      targetToday: 1_000_000_000,
      rangeLow: 1_000_000_000,
      rangeHigh: 1_000_000_000,
      userOverride: 1_000_000_000,
      sources: [],
      inputsUsed: houseInputs,
      calculatedAt: NOW.toISOString(),
    });
    // Growth over the two years to 2028 at the property rule's rate.
    expect(goal.estimate?.growthRatePerYear).toBeGreaterThan(0);
    expect(goal.estimate?.targetAtGoalDate).toBe(
      Math.round(1_000_000_000 * (1 + (goal.estimate?.growthRatePerYear ?? 0)) ** 2),
    );
  });

  it("refuses an analysing goal with 409 and another user's goal with 404", async () => {
    const store = new FakeGoalWriteStore().addGoal("u1", { ...draft, status: "analysing" });
    const { call } = setup(store);
    expect((await call("PATCH", "/goals/g1", { payPreference: "cash" })).status).toBe(409);
    expect((await call("PATCH", "/goals/g1", { payPreference: "cash" }, "u2")).status).toBe(404);
  });
});

describe("DELETE /goals/:id", () => {
  it("deletes a draft and answers 204", async () => {
    const { call, store } = setup();
    const res = await call("DELETE", "/goals/g1");
    expect(res.status).toBe(204);
    expect(await store.getGoal("u1", "g1")).toBeNull();
    expect(store.deleted).toEqual(["u1/g1"]);
  });

  it("refuses while analysing and is 404 for a missing goal", async () => {
    const store = new FakeGoalWriteStore().addGoal("u1", { ...draft, status: "analysing" });
    const { call } = setup(store);
    expect((await call("DELETE", "/goals/g1")).status).toBe(409);
    expect((await call("DELETE", "/goals/nope")).status).toBe(404);
  });
});
