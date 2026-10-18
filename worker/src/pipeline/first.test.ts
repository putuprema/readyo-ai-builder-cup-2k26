import type { DocumentRecord, Goal, RuleValue, RunStatus, UserRecord } from "@adidi/shared";
import { hasUndefined } from "@adidi/shared";
import defaultRules from "@adidi/shared/rules/defaults.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { call } from "../agent/fakes.js";
import { SIMULATE_TOOL } from "../agent/tools.js";
import { FakeRecords, FakeStorage } from "../extraction/fakes.js";
import { storagePathFor } from "../extraction/ports.js";
import { sampleLoanBill, samplePortfolio, sampleStatement } from "../extraction/samples.js";
import { ModelError } from "../gemini/client.js";
import { FakePipelineModel, FakeRunStore } from "./fakes.js";
import { createRunners } from "./kinds.js";
import { runPipeline } from "./runner.js";

// specs/07-pipeline-runs.md task 3, the `first` run end to end over the fakes: stage updates in
// order ending `done` with an Analysis stored; a forced extraction failure ends `failed` with the
// goal back to `draft`; a retried task creates no duplicate transactions.

const NOW = new Date("2026-10-18T10:00:00.000Z");
const uid = "u1";
const MONTH = "2026-09";

const user: UserRecord = {
  age: 31,
  employment: "permanent",
  netMonthlyIncome: 15_000_000,
  maritalStatus: "single",
  dependents: 0,
  city: "Tangerang Selatan",
  preferences: { dismissedActions: [{ type: "cap_spending", category: "food_delivery" }] },
};

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
    targetYear: 2030,
    joint: "not_married",
  },
  estimate: {
    targetToday: 800_000_000,
    rangeLow: 700_000_000,
    rangeHigh: 900_000_000,
    growthRatePerYear: 0.06,
    targetAtGoalDate: 1_010_000_000,
    sources: [],
    inputsUsed: {},
    calculatedAt: "2026-10-17T00:00:00.000Z",
  },
  createdAt: "2026-10-17T00:00:00.000Z",
  updatedAt: "2026-10-17T00:00:00.000Z",
};

function document(id: string, sourceKind: DocumentRecord["sourceKind"]): DocumentRecord {
  return {
    id,
    name: `${sourceKind}.pdf`,
    type: "application/pdf",
    size: 1000,
    sourceKind,
    month: MONTH,
    status: "uploaded",
    createdAt: "2026-10-18T09:00:00.000Z",
  };
}

const documents = [
  document("d_bank", "bank"),
  document("d_paylater", "paylater"),
  document("d_invest", "investment"),
];

function setup(options: { model?: FakePipelineModel; run?: Partial<RunStatus> } = {}) {
  const store = new FakeRunStore();
  store.rules = defaultRules as RuleValue[];
  store.users.set(uid, user);
  store.goals.set("g1", goal);
  store.runs.set("run_1", {
    id: "run_1",
    stage: "reading",
    percent: 0,
    startedAt: "2026-10-18T09:59:00.000Z",
    goalIds: ["g1"],
    month: MONTH,
    kind: "first",
    documentIds: documents.map((d) => d.id),
    goalStatusBefore: { g1: "draft" },
    attempt: 0,
    ...options.run,
  });
  const storage = new FakeStorage(
    Object.fromEntries(
      documents.map((d) => [
        storagePathFor(uid, d.id),
        { bytes: new Uint8Array([1, 2, 3]), contentType: d.type },
      ]),
    ),
  );
  const records = new FakeRecords(documents);
  const model =
    options.model ??
    new FakePipelineModel({
      extraction: [sampleStatement, sampleLoanBill, samplePortfolio],
      turns: [
        [call(SIMULATE_TOOL, { type: "move_assets", amount: 8_000_000, fromMonth: 0 })],
        "Done.",
      ],
    });
  const logs: string[] = [];
  const deps = {
    store,
    runners: createRunners({ storage, records, model, now: () => NOW }),
    now: () => NOW,
    log: (m: string) => logs.push(m),
  };
  const run = (attempt = 0) => runPipeline({ uid, runId: "run_1" }, attempt, deps);
  return { store, storage, records, model, logs, run };
}

describe("first run", () => {
  it("reads, cleans, snapshots, simulates and plans, then ends done with an Analysis", async () => {
    const { store, storage, records, model, run } = setup();

    const outcome = await run();

    expect(outcome.status).toBe(200);
    expect(store.stagesSeen()).toEqual(["reading", "cleaning", "checking", "planning", "done"]);
    expect(store.runs.get("run_1")).toMatchObject({ stage: "done", percent: 100 });

    // Stage 2–3: three documents extracted, files gone, rows classified.
    expect(model.extractionRequests).toHaveLength(3);
    expect(storage.deleted).toHaveLength(3);
    expect([...records.documents.values()].every((d) => d.status === "extracted")).toBe(true);
    expect(records.documents.get("d_bank")?.closingBalance).toBe(9_830_000);
    const rows = [...records.transactions.values()];
    expect(rows).toHaveLength(3);
    expect(rows.every((t) => t.cls !== undefined)).toBe(true);

    // Stage 4: the month record with the snapshot, sources and the run id.
    const month = store.months.get(MONTH);
    expect(month).toMatchObject({ runId: "run_1", submittedAt: NOW.toISOString() });
    expect(month?.sources.map((s) => s.kind)).toEqual(["bank", "paylater", "investment"]);
    expect(month?.snapshot).toMatchObject({
      month: MONTH,
      netIncome: 15_000_000,
      bankBalances: 9_830_000,
      liquidAssets: 29_830_000, // closing balance + the money market fund
      volatileAssets: 18_000_000, // BBCA + BTC
      estimatedSources: [],
    });
    expect(month?.snapshot.loans).toHaveLength(1);
    expect(month?.snapshot.loans[0]).toMatchObject({
      lender: "SPayLater",
      outstandingPrincipal: 12_400_000,
    });

    // Stages 5–6: the analysis with seven metrics and both simulations, no undefined anywhere.
    const analysis = store.analyses.get(`g1/${MONTH}`);
    expect(analysis).toBeDefined();
    expect(analysis).toMatchObject({ goalId: "g1", month: MONTH, runId: "run_1" });
    expect(analysis?.metrics).toHaveLength(7);
    expect(analysis?.withoutPlan.loan).toBeDefined();
    expect(analysis?.withoutPlan.cash.timeline.length).toBeGreaterThan(0);
    expect(typeof analysis?.summary).toBe("string");
    expect(hasUndefined(analysis)).toBe(false);
    expect(hasUndefined(month)).toBe(false);

    // The dismissed preference reached the agent's prompt; the goal is active with the month.
    expect(JSON.stringify(model.stepRequests[0]?.history ?? [])).toMatch(
      /Dismissed by the user earlier.*food_delivery/,
    );
    expect(store.goals.get("g1")).toMatchObject({ status: "active", latestAnalysisMonth: MONTH });
    expect(store.runs.get("run_1")?.goals?.g1).toMatchObject({ toolCalls: 1 });
  });

  it("ends failed with the goal back to draft when the bank statement cannot be read", async () => {
    const model = new FakePipelineModel({
      extraction: [new ModelError("empty_response", "nothing"), sampleLoanBill, samplePortfolio],
    });
    const { store, records, run } = setup({ model });

    const outcome = await run();

    expect(outcome.status).toBe(200);
    expect(store.stagesSeen()).toEqual(["reading", "failed"]);
    expect(store.runs.get("run_1")?.error).toMatch(/could not read your bank statement/);
    expect(store.goals.get("g1")).toMatchObject({ status: "draft", draftStep: "documents" });
    expect(records.documents.get("d_bank")).toMatchObject({ status: "failed" });
    expect(store.months.get(MONTH)).toBeUndefined();
    expect(store.analyses.size).toBe(0);
  });

  it("fails with a message when the goal has no estimate", async () => {
    const { store, run } = setup();
    const { estimate: _estimate, ...unpriced } = goal;
    store.goals.set("g1", unpriced);
    await run();
    expect(store.runs.get("run_1")?.error).toMatch(/price estimate/);
  });

  it("a retried task after a crash reuses the extraction and stores no duplicates", async () => {
    const { store, records, model, run } = setup();
    // Model failures inside cleaning and planning fall back to defaults, so the crash that reaches
    // the runner is an infrastructure one: the first write of the month record fails.
    const setMonth = store.setMonth.bind(store);
    let crashed = false;
    store.setMonth = async (u, month, record) => {
      if (!crashed) {
        crashed = true;
        throw new TypeError("Firestore unavailable");
      }
      return setMonth(u, month, record);
    };

    const first = await run(0);
    expect(first.status).toBe(500);
    expect(store.runs.get("run_1")).toMatchObject({ stage: "cleaning", attempt: 1 });
    expect(store.goals.get("g1")?.status).toBe("analysing");

    const second = await run(1);
    expect(second.status).toBe(200);
    expect(store.runs.get("run_1")).toMatchObject({ stage: "done", attempt: 2 });
    // Extraction ran once per document in total; the retry reused the stored records.
    expect(model.extractionRequests).toHaveLength(3);
    expect(store.stagesSeen().filter((s) => s === "reading")).toHaveLength(2);
    expect([...records.transactions.values()]).toHaveLength(3);
    expect(new Set([...records.transactions.values()].map((t) => t.id)).size).toBe(3);
    expect(store.months.get(MONTH)?.snapshot.bankBalances).toBe(9_830_000);
    expect(store.analyses.get(`g1/${MONTH}`)?.runId).toBe("run_1");
  });

  it("a retried task after the analysis was stored does not read the documents or plan again", async () => {
    const { store, model, run } = setup();
    await run(0);
    // Simulate Cloud Tasks retrying a run whose final write did not reach the queue: the run is
    // put back to `planning` with the month and analysis already written by this run.
    const finished = store.runs.get("run_1");
    if (!finished) throw new Error("no run");
    store.runs.set("run_1", { ...finished, stage: "planning", percent: 92 });
    const before = {
      extraction: model.extractionRequests.length,
      steps: model.stepRequests.length,
    };

    const outcome = await run(1);

    expect(outcome.status).toBe(200);
    expect(model.extractionRequests).toHaveLength(before.extraction);
    expect(model.stepRequests).toHaveLength(before.steps);
    expect(store.stagesSeen().slice(-2)).toEqual(["checking", "done"]);
  });
});
