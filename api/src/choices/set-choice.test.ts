import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Analysis, Goal, Profile, Snapshot } from "@adidi/shared";
import { hasUndefined, mergeRules, simulate } from "@adidi/shared";
import defaultRules from "@adidi/shared/rules/defaults.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { FakeAnalysisStore } from "./fakes.js";

// PATCH /goals/:id/analyses/:month/choices against the fakes (specs/06-agent.md task 4): the
// choice is stored, the plan line is simulate() with every non-dismissed action, dismissed
// actions reach users/{uid}.preferences and an undo takes them out again.

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, "../../../fixtures/profiles/house-a.json"), "utf8"),
) as { snapshot: Snapshot; profile: Profile; goal: Goal };
const MONTH = fixture.snapshot.month;
const rules = mergeRules(defaultRules as never);

const payOff = { type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 } as const;
const capFood = {
  type: "cap_spending",
  category: "food_delivery",
  monthlyCap: 500_000,
  fromMonth: 1,
} as const;

const withoutPlan = simulate({ ...fixture, rules, changes: [] });
const withPlan = simulate({ ...fixture, rules, changes: [payOff, capFood] });

const analysis: Analysis = {
  goalId: "g1",
  month: MONTH,
  metrics: [],
  withoutPlan,
  withPlan,
  actions: [
    {
      id: "a1",
      title: "Pay the PayLater off",
      impactLine: "",
      description: "",
      chips: [],
      monthsSaved: 3,
      change: payOff,
    },
    {
      id: "a2",
      title: "Cap food delivery",
      impactLine: "",
      description: "",
      chips: [],
      monthsSaved: 1,
      change: capFood,
    },
  ],
  choices: { a1: "undecided", a2: "undecided" },
  rejectedOptions: [],
  summary: "s",
};

function setup() {
  const store = new FakeAnalysisStore();
  store.goals.set("u1/g1", {
    ...fixture.goal,
    id: "g1",
    status: "active",
    latestAnalysisMonth: MONTH,
  });
  store.analyses.set(`u1/g1/${MONTH}`, structuredClone(analysis));
  store.users.set("u1", {
    ...fixture.profile,
    preferences: { dismissedActions: [{ type: "move_assets" }] },
  });
  store.months.set(`u1/${MONTH}`, { snapshot: fixture.snapshot, sources: [], submittedAt: "x" });
  const app = createApp({
    verifyToken: async (token) =>
      token === "u1" ? { uid: "u1" } : token === "u2" ? { uid: "u2" } : null,
    log: false,
    choices: { store },
  });
  const patch = (body: unknown, path = `/goals/g1/analyses/${MONTH}/choices`, token = "u1") =>
    app.request(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  return { store, patch };
}

describe("PATCH /goals/:id/analyses/:month/choices", () => {
  it("stores the choice and the plan with every non-dismissed action", async () => {
    const { store, patch } = setup();
    const res = await patch({ actionId: "a1", choice: "committed" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      choices: Record<string, string>;
      plan: Record<string, unknown>;
    };
    expect(body.choices).toEqual({ a1: "committed", a2: "undecided" });
    expect(body.plan).toMatchObject({
      leadingPath: "loan",
      included: ["a1", "a2"],
      skipped: [],
      committed: ["a1"],
      monthsToReady: { loan: withPlan.loan?.monthsToReady, cash: withPlan.cash.monthsToReady },
      withAllActions: { loan: withPlan.loan?.monthsToReady },
    });
    const stored = store.analyses.get(`u1/g1/${MONTH}`);
    expect(stored?.choices).toEqual({ a1: "committed", a2: "undecided" });
    expect(stored?.withChoices).toEqual(JSON.parse(JSON.stringify(withPlan)));
    expect(hasUndefined(stored?.withChoices)).toBe(false);
    expect(store.dismissedWrites).toEqual([]); // nothing dismissed, preferences untouched
  });

  it("drops a dismissed action from the plan and saves it as a preference", async () => {
    const { store, patch } = setup();
    const res = await patch({ actionId: "a1", choice: "dismissed" });

    const body = (await res.json()) as {
      plan: { included: string[]; skipped: string[]; monthsToReady: { loan: number | null } };
    };
    expect(body.plan.included).toEqual(["a2"]);
    expect(body.plan.skipped).toEqual(["a1"]);
    const onlyCap = simulate({ ...fixture, rules, changes: [capFood] });
    expect(body.plan.monthsToReady.loan).toBe(onlyCap.loan?.monthsToReady);
    expect(store.users.get("u1")?.preferences?.dismissedActions).toEqual([
      { type: "move_assets" },
      { type: "pay_off_loan", loanId: "paylater-1" },
    ]);
  });

  it("an undo takes the action out of the preferences again", async () => {
    const { store, patch } = setup();
    await patch({ actionId: "a2", choice: "dismissed" });
    expect(store.users.get("u1")?.preferences?.dismissedActions).toEqual([
      { type: "move_assets" },
      { type: "cap_spending", category: "food_delivery" },
    ]);
    await patch({ actionId: "a2", choice: "undecided" });
    expect(store.users.get("u1")?.preferences?.dismissedActions).toEqual([{ type: "move_assets" }]);
    expect(store.dismissedWrites).toHaveLength(2);
  });

  it("rejects an action id the analysis does not have", async () => {
    const { patch } = setup();
    const res = await patch({ actionId: "zz", choice: "committed" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: "invalid_request",
      issues: [{ path: "actionId" }],
    });
  });

  it("answers 404 for a missing goal, another user's goal, or a month without an analysis", async () => {
    const { patch } = setup();
    expect(
      (await patch({ actionId: "a1", choice: "committed" }, "/goals/nope/analyses/2026-09/choices"))
        .status,
    ).toBe(404);
    expect((await patch({ actionId: "a1", choice: "committed" }, undefined, "u2")).status).toBe(
      404,
    );
    expect(
      (await patch({ actionId: "a1", choice: "committed" }, "/goals/g1/analyses/2026-08/choices"))
        .status,
    ).toBe(404);
  });

  it("answers 409 while the goal is being analysed", async () => {
    const { store, patch } = setup();
    const goal = store.goals.get("u1/g1");
    if (goal) store.goals.set("u1/g1", { ...goal, status: "analysing" });
    expect((await patch({ actionId: "a1", choice: "committed" })).status).toBe(409);
  });

  it("answers 501 when the store is not configured", async () => {
    const app = createApp({ verifyToken: async () => ({ uid: "u1" }), log: false });
    const res = await app.request(`/goals/g1/analyses/${MONTH}/choices`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer x" },
      body: JSON.stringify({ actionId: "a1", choice: "committed" }),
    });
    expect(res.status).toBe(501);
  });
});
