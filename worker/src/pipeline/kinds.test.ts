import type { Analysis, Goal, RuleValue, RunStatus, UserRecord } from "@adidi/shared";
import defaultRules from "@adidi/shared/rules/defaults.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { call } from "../agent/fakes.js";
import { loadProfile } from "../agent/profiles.test-helper.js";
import { SIMULATE_TOOL } from "../agent/tools.js";
import { FakeRecords, FakeStorage } from "../extraction/fakes.js";
import { FakePipelineModel, FakeRunStore } from "./fakes.js";
import { createRunners } from "./kinds.js";
import { runPipeline } from "./runner.js";

// specs/07-pipeline-runs.md task 4: `reuse` never calls extraction and analyses the new goal on
// the stored month; `recalculate` reruns stages 5–6 for every active goal with the current
// overrides and keeps the user's choices for matching actions.

const NOW = new Date("2026-10-18T10:00:00.000Z");
const uid = "u1";
const houseA = loadProfile("house-a");
const MONTH = houseA.snapshot.month;

const user: UserRecord = { ...houseA.profile };

const payOff = call(SIMULATE_TOOL, { type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 });

function setup(run: Partial<RunStatus>, goals: Goal[]) {
  const store = new FakeRunStore();
  store.rules = defaultRules as RuleValue[];
  store.users.set(uid, user);
  for (const g of goals) store.goals.set(g.id, g);
  store.months.set(MONTH, {
    snapshot: houseA.snapshot,
    sources: [{ kind: "bank", documentId: "d1", name: "bank.pdf" }],
    submittedAt: "2026-10-03T00:00:00.000Z",
    runId: "run_0",
  });
  store.runs.set("run_1", {
    id: "run_1",
    stage: "reading",
    percent: 0,
    startedAt: "2026-10-18T09:59:00.000Z",
    goalIds: goals.map((g) => g.id),
    month: MONTH,
    kind: "reuse",
    goalStatusBefore: Object.fromEntries(goals.map((g) => [g.id, g.status])),
    attempt: 0,
    ...run,
  });
  const model = new FakePipelineModel({
    extraction: [],
    turns: [[payOff], "Done.", [payOff], "Done."], // enough for two goals
  });
  const deps = {
    store,
    runners: createRunners({
      storage: new FakeStorage(),
      records: new FakeRecords(),
      model,
      now: () => NOW,
    }),
    now: () => NOW,
    log: () => {},
  };
  return { store, model, run: () => runPipeline({ uid, runId: "run_1" }, 0, deps) };
}

describe("reuse run", () => {
  it("analyses the new goal on the stored snapshot without reading any document", async () => {
    const newGoal: Goal = { ...houseA.goal, id: "g2", status: "analysing", draftStep: "documents" };
    const { store, model, run } = setup({ kind: "reuse", goalStatusBefore: { g2: "draft" } }, [
      newGoal,
    ]);

    const outcome = await run();

    expect(outcome.status).toBe(200);
    expect(store.stagesSeen()).toEqual(["checking", "planning", "done"]);
    expect(model.extractionRequests).toEqual([]);
    expect(model.classifyRequests).toEqual([]);
    const analysis = store.analyses.get(`g2/${MONTH}`);
    expect(analysis).toMatchObject({ goalId: "g2", month: MONTH, runId: "run_1" });
    expect(analysis?.actions.map((a) => a.change.type)).toEqual(["pay_off_loan"]);
    expect(store.goals.get("g2")).toMatchObject({ status: "active", latestAnalysisMonth: MONTH });
    expect(store.months.get(MONTH)?.runId).toBe("run_0"); // the month record is untouched
  });

  it("fails with a message when the month was never submitted", async () => {
    const newGoal: Goal = { ...houseA.goal, id: "g2", status: "analysing" };
    const { store, run } = setup(
      { kind: "reuse", month: "2026-08", goalStatusBefore: { g2: "draft" } },
      [newGoal],
    );
    await run();
    expect(store.runs.get("run_1")).toMatchObject({ stage: "failed" });
    expect(store.runs.get("run_1")?.error).toMatch(/No statements are stored for 2026-08/);
    expect(store.goals.get("g2")?.status).toBe("draft");
  });
});

describe("recalculate run", () => {
  it("reruns every active goal with the current overrides and keeps matching choices", async () => {
    const g1: Goal = { ...houseA.goal, id: "g1", status: "analysing", latestAnalysisMonth: MONTH };
    const g2: Goal = { ...houseA.goal, id: "g2", status: "analysing", latestAnalysisMonth: MONTH };
    const { store, model, run } = setup(
      { kind: "recalculate", goalStatusBefore: { g1: "active", g2: "active" } },
      [g1, g2],
    );
    store.overrides = [{ ruleId: "dti_cap", value: 0.5, updatedAt: "2026-10-18T09:00:00.000Z" }];
    const earlier: Analysis = {
      goalId: "g1",
      month: MONTH,
      metrics: [],
      withoutPlan: {
        cash: { monthsToReady: null, timeline: [] },
        rulesChecked: [],
        rejectedOptions: [],
      },
      withPlan: {
        cash: { monthsToReady: null, timeline: [] },
        rulesChecked: [],
        rejectedOptions: [],
      },
      actions: [
        {
          id: "old_a",
          title: "Pay the PayLater off",
          impactLine: "",
          description: "",
          chips: [],
          monthsSaved: 3,
          change: { type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 },
        },
        {
          id: "old_b",
          title: "Cap food delivery",
          impactLine: "",
          description: "",
          chips: [],
          monthsSaved: 1,
          change: {
            type: "cap_spending",
            category: "food_delivery",
            monthlyCap: 500_000,
            fromMonth: 1,
          },
        },
      ],
      choices: { old_a: "committed", old_b: "dismissed" },
      rejectedOptions: [],
      summary: "old",
      runId: "run_0",
    };
    store.analyses.set(`g1/${MONTH}`, earlier);
    // The second goal gets the same scripted plan.

    const outcome = await run();

    expect(outcome.status).toBe(200);
    expect(store.stagesSeen()).toEqual(["checking", "planning", "done"]);
    expect(model.extractionRequests).toEqual([]);
    const a1 = store.analyses.get(`g1/${MONTH}`);
    expect(a1?.runId).toBe("run_1");
    expect(a1?.withoutPlan.rulesChecked.find((r) => r.rule === "dti_cap")?.valueUsed).toBe(0.5);
    // The pay-off action is proposed again and keeps its "committed" choice under its new id.
    const payOffAction = a1?.actions.find((a) => a.change.type === "pay_off_loan");
    expect(payOffAction).toBeDefined();
    expect(a1?.choices[payOffAction?.id ?? ""]).toBe("committed");
    expect(store.analyses.get(`g2/${MONTH}`)?.runId).toBe("run_1");
    for (const id of ["g1", "g2"]) {
      expect(store.goals.get(id)).toMatchObject({ status: "active", latestAnalysisMonth: MONTH });
    }
  });
});
