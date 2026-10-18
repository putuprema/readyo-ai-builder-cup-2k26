import type { Goal, HouseInputs } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { ModelError } from "../gemini/client.js";
import { FakeGoalStore, FakeModel } from "./fakes.js";
import { NO_SOURCE_MESSAGE } from "./price.js";

// POST /goals/:id/estimate end to end against the fakes (specs/05-pricing.md): the Estimate is
// stored on the goal with inputsUsed and calculatedAt, the growth comes from the rules table
// (with the user's override), the no-source answer is HTTP 200 with a null target, and nothing
// is stored in that case.

const NOW = new Date("2026-10-18T09:30:00.000Z");

const serpong: HouseInputs = {
  area: "Serpong",
  propertyType: "landed",
  landM2: 70,
  buildingM2: 90,
  market: "new",
  firstHome: true,
  targetYear: 2028,
};

const draft: Goal = {
  id: "g1",
  type: "house",
  status: "draft",
  draftStep: "estimate",
  payPreference: "loan",
  inputs: { ...serpong, area: "Tangerang Selatan" }, // the saved draft lags behind the form
  createdAt: "2026-10-17T00:00:00.000Z",
  updatedAt: "2026-10-17T00:00:00.000Z",
};

const answer = {
  targetToday: 1_350_000_000,
  rangeLow: 1_100_000_000,
  rangeHigh: 1_600_000_000,
  sources: [{ title: "Rumah123", url: "https://www.rumah123.com/x", date: "2026-10" }],
  reasoning: "Cluster listings.",
};

function setup(
  model = FakeModel.returning(answer),
  store = new FakeGoalStore().addGoal("u1", draft),
) {
  const app = createApp({
    verifyToken: async (token) =>
      token === "u1" ? { uid: "u1" } : token === "u2" ? { uid: "u2" } : null,
    log: false,
    estimate: { model, store, now: () => NOW },
  });
  const post = (goalId: string, body: unknown, token = "u1") =>
    app.request(`/goals/${goalId}/estimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  return { app, post, model, store };
}

describe("POST /goals/:id/estimate", () => {
  it("stores the estimate on the goal with the exact inputs sent and returns it", async () => {
    const { post, store } = setup();
    const res = await post("g1", { type: "house", inputs: serpong });
    expect(res.status).toBe(200);
    const estimate = await res.json();
    expect(estimate).toEqual({
      targetToday: 1_350_000_000,
      rangeLow: 1_100_000_000,
      rangeHigh: 1_600_000_000,
      growthRatePerYear: 0.06,
      targetAtGoalDate: 1_516_860_000, // 1.35 bn × 1.06² to the rupiah
      sources: [{ title: "Rumah123", url: "https://www.rumah123.com/x", date: "2026-10" }],
      inputsUsed: serpong,
      calculatedAt: NOW.toISOString(),
    });
    const stored = await store.getGoal("u1", "g1");
    expect(stored?.estimate).toEqual(estimate);
    expect(stored?.updatedAt).toBe(NOW.toISOString());
    expect(stored?.inputs).toEqual(draft.inputs); // the saved draft itself is not touched
  });

  it("grows with the user's override of the growth rule", async () => {
    const { post, store } = setup();
    store.overrides = [{ ruleId: "growth_property", value: 0.1, updatedAt: NOW.toISOString() }];
    const estimate = await (await post("g1", { type: "house", inputs: serpong })).json();
    expect(estimate).toMatchObject({
      growthRatePerYear: 0.1,
      targetAtGoalDate: Math.round(1_350_000_000 * 1.1 ** 2),
    });
  });

  it("replaces a previous estimate wholesale, including the user's own price", async () => {
    const previous: Goal = {
      ...draft,
      estimate: {
        ...answer,
        growthRatePerYear: 0.06,
        targetAtGoalDate: 1,
        userOverride: 900_000_000,
        inputsUsed: {},
        calculatedAt: "2026-10-01T00:00:00.000Z",
      },
    };
    const { post, store } = setup(undefined, new FakeGoalStore().addGoal("u1", previous));
    await post("g1", { type: "house", inputs: serpong });
    expect((await store.getGoal("u1", "g1"))?.estimate?.userOverride).toBeUndefined();
  });

  it("may be called twice with identical inputs (the UI only calls on button press)", async () => {
    const { post, store, model } = setup();
    await post("g1", { type: "house", inputs: serpong });
    await post("g1", { type: "house", inputs: serpong });
    expect(model.requests).toHaveLength(2);
    expect(store.writes).toHaveLength(2);
  });

  it("answers 200 with a null target and a message when search found no source, storing nothing", async () => {
    const model = FakeModel.returning({ ...answer, targetToday: null, sources: [] });
    const { post, store } = setup(model);
    const res = await post("g1", { type: "house", inputs: serpong });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ targetToday: null, message: NO_SOURCE_MESSAGE });
    expect(store.writes).toHaveLength(0);
    expect((await store.getGoal("u1", "g1"))?.estimate).toBeUndefined();
  });

  it("answers 200 with a null target when the model call fails", async () => {
    const { post } = setup(FakeModel.throwing(new ModelError("api_error", "Gemini API error 503")));
    const res = await post("g1", { type: "house", inputs: serpong });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      targetToday: null,
      message: expect.stringMatching(/did not complete/),
    });
  });

  it("answers 404 for a missing goal and for another user's goal", async () => {
    const { post } = setup();
    expect((await post("nope", { type: "house", inputs: serpong })).status).toBe(404);
    expect((await post("g1", { type: "house", inputs: serpong }, "u2")).status).toBe(404);
  });

  it("answers 400 when the body's type is not the goal's type or the inputs are invalid", async () => {
    const { post } = setup();
    const wrongType = await post("g1", {
      type: "car",
      inputs: { condition: "new", modelOrSegment: "LCGC", city: "Jakarta", targetYear: 2027 },
    });
    expect(wrongType.status).toBe(400);
    expect(await wrongType.json()).toMatchObject({
      error: "invalid_request",
      issues: [{ path: "type" }],
    });
    expect(
      (await post("g1", { type: "house", inputs: { ...serpong, targetYear: 1999 } })).status,
    ).toBe(400);
    expect((await post("g1", { type: "house", inputs: serpong, extra: 1 })).status).toBe(400);
  });

  it("answers 409 while the goal is being analysed", async () => {
    const { post } = setup(
      undefined,
      new FakeGoalStore().addGoal("u1", { ...draft, status: "analysing" }),
    );
    const res = await post("g1", { type: "house", inputs: serpong });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "conflict" });
  });

  it("answers 501 for car and wedding goals until M2", async () => {
    const car: Goal = {
      ...draft,
      id: "g2",
      type: "car",
      inputs: { condition: "new", modelOrSegment: "LCGC", city: "Jakarta", targetYear: 2027 },
    };
    const { post, model } = setup(undefined, new FakeGoalStore().addGoal("u1", car));
    const res = await post("g2", { type: "car", inputs: car.inputs });
    expect(res.status).toBe(501);
    expect(model.requests).toHaveLength(0);
  });

  it("answers 401 without a token and 501 when the app has no pricing deps", async () => {
    const { post } = setup();
    expect((await post("g1", { type: "house", inputs: serpong }, "bad")).status).toBe(401);
    const bare = createApp({ verifyToken: async () => ({ uid: "u1" }), log: false });
    const res = await bare.request("/goals/g1/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer x" },
      body: JSON.stringify({ type: "house", inputs: serpong }),
    });
    expect(res.status).toBe(501);
  });
});
