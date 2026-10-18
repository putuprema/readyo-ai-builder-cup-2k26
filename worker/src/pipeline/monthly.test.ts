import type { Analysis, DocumentRecord, Goal, RuleValue, UserRecord } from "@adidi/shared";
import { hasUndefined } from "@adidi/shared";
import defaultRules from "@adidi/shared/rules/defaults.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { call } from "../agent/fakes.js";
import { loadProfile } from "../agent/profiles.test-helper.js";
import { SIMULATE_TOOL } from "../agent/tools.js";
import { FakeRecords, FakeStorage } from "../extraction/fakes.js";
import { storagePathFor } from "../extraction/ports.js";
import { samplePortfolio, sampleStatement } from "../extraction/samples.js";
import { FakePipelineModel, FakeRunStore } from "./fakes.js";
import { createRunners } from "./kinds.js";
import { runPipeline } from "./runner.js";

// specs/07-pipeline-runs.md task 5: a monthly run reads the new month, carries the sources that
// were not uploaded, updates every active goal and stores a delta for each.

const NOW = new Date("2026-11-02T10:00:00.000Z");
const uid = "u1";
const houseA = loadProfile("house-a");
const PREVIOUS = houseA.snapshot.month; // 2026-09
const MONTH = "2026-10";

const user: UserRecord = { ...houseA.profile };

const payOff = call(SIMULATE_TOOL, { type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 });

function document(id: string, sourceKind: DocumentRecord["sourceKind"]): DocumentRecord {
  return {
    id,
    name: `${sourceKind}-oct.pdf`,
    type: "application/pdf",
    size: 1000,
    sourceKind,
    month: MONTH,
    status: "uploaded",
    createdAt: "2026-11-02T09:00:00.000Z",
  };
}

const empty = {
  cash: { monthsToReady: null, timeline: [] },
  rulesChecked: [],
  rejectedOptions: [],
};

function previousAnalysis(goalId: string, committed: boolean): Analysis {
  return {
    goalId,
    month: PREVIOUS,
    metrics: [
      {
        id: "net_income",
        label: "Verified net income",
        you: 18_000_000,
        status: "passes",
        meaning: "",
      },
      { id: "dti", label: "Debt-to-income", you: 0.382, status: "blocks", meaning: "" },
    ],
    withoutPlan: {
      ...empty,
      loan: { monthsToReady: null, timeline: [], approvableToday: false, blockedBy: [] },
    },
    withPlan: empty,
    actions: committed
      ? [
          {
            id: "a1",
            title: "Pay the PayLater off",
            impactLine: "",
            description: "",
            chips: [],
            monthsSaved: 3,
            change: { type: "pay_off_loan", loanId: "paylater-1", fromMonth: 0 },
          },
          {
            id: "a2",
            title: "Cap food delivery at Rp 500 k",
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
          {
            id: "a3",
            title: "Move Rp 15 m of volatile assets",
            impactLine: "",
            description: "",
            chips: [],
            monthsSaved: 2,
            change: { type: "move_assets", amount: 15_000_000, fromMonth: 0 },
          },
        ]
      : [],
    choices: committed ? { a1: "committed", a2: "committed", a3: "undecided" } : {},
    rejectedOptions: [],
    summary: "earlier",
    runId: "run_0",
  };
}

function setup() {
  const g1: Goal = { ...houseA.goal, id: "g1", status: "analysing", latestAnalysisMonth: PREVIOUS };
  const g2: Goal = { ...houseA.goal, id: "g2", status: "analysing", latestAnalysisMonth: PREVIOUS };
  const documents = [document("d_bank_oct", "bank"), document("d_invest_oct", "investment")];
  const store = new FakeRunStore();
  store.rules = defaultRules as RuleValue[];
  store.users.set(uid, user);
  store.goals.set("g1", g1);
  store.goals.set("g2", g2);
  store.months.set(PREVIOUS, {
    snapshot: houseA.snapshot,
    sources: [
      { kind: "bank", documentId: "d_bank_sep", name: "bank-sep.pdf" },
      { kind: "paylater", documentId: "d_pl_sep", name: "paylater-sep.pdf" },
      { kind: "investment", documentId: "d_inv_sep", name: "invest-sep.pdf" },
    ],
    submittedAt: "2026-10-03T00:00:00.000Z",
    runId: "run_0",
  });
  store.analyses.set(`g1/${PREVIOUS}`, previousAnalysis("g1", true));
  store.analyses.set(`g2/${PREVIOUS}`, previousAnalysis("g2", false));
  store.runs.set("run_1", {
    id: "run_1",
    stage: "reading",
    percent: 0,
    startedAt: "2026-11-02T09:59:00.000Z",
    goalIds: ["g1", "g2"],
    month: MONTH,
    kind: "monthly",
    documentIds: documents.map((d) => d.id),
    goalStatusBefore: { g1: "active", g2: "active" },
    attempt: 0,
  });
  const storage = new FakeStorage(
    Object.fromEntries(
      documents.map((d) => [
        storagePathFor(uid, d.id),
        { bytes: new Uint8Array([1]), contentType: d.type },
      ]),
    ),
  );
  const records = new FakeRecords(documents);
  const model = new FakePipelineModel({
    extraction: [sampleStatement, samplePortfolio],
    turns: [[payOff], "Done.", [payOff], "Done."],
    delta: { summary: "Your income is now Rp 99 bn. Everything changed." }, // invented numbers → template
  });
  const deps = {
    store,
    runners: createRunners({ storage, records, model, now: () => NOW }),
    now: () => NOW,
    log: () => {},
  };
  return { store, model, records, run: () => runPipeline({ uid, runId: "run_1" }, 0, deps) };
}

describe("monthly run", () => {
  it("updates every active goal, carries the missing PayLater and stores a delta for each", async () => {
    const { store, model, run } = setup();

    const outcome = await run();

    expect(outcome.status).toBe(200);
    expect(store.stagesSeen()).toEqual(["reading", "cleaning", "checking", "planning", "done"]);
    expect(model.extractionRequests).toHaveLength(2);

    const month = store.months.get(MONTH);
    expect(month?.snapshot.estimatedSources).toEqual(["paylater"]);
    expect(month?.snapshot.loans.map((l) => l.lender)).toEqual(["PayLater"]); // carried as is
    expect(month?.snapshot.netIncome).toBe(18_000_000); // the profile's confirmed income
    expect(month?.snapshot.computedNetIncome).toBe(15_000_000);

    for (const goalId of ["g1", "g2"]) {
      const analysis = store.analyses.get(`${goalId}/${MONTH}`);
      expect(analysis?.runId).toBe("run_1");
      expect(analysis?.delta?.previousMonth).toBe(PREVIOUS);
      expect(hasUndefined(analysis)).toBe(false);
      expect(store.goals.get(goalId)).toMatchObject({
        status: "active",
        latestAnalysisMonth: MONTH,
      });
      expect(store.analyses.get(`${goalId}/${PREVIOUS}`)?.summary).toBe("earlier"); // untouched
    }

    const delta = store.analyses.get(`g1/${MONTH}`)?.delta;
    expect(delta?.metricsChanged.map((m) => m.id)).toContain("dti"); // 0.382 in the old test metrics vs real
    expect(delta?.committedActions.map((a) => [a.actionId, a.kept])).toEqual([
      ["a1", false], // the PayLater was carried forward, so it still shows
      ["a2", true], // nothing classified as food delivery this month
    ]);
    expect(delta?.committedActions[0]?.evidence).toBe("PayLater still shows Rp 12.4 m outstanding");
    expect(delta?.monthsToReady.leadingPath).toBe("loan");
    // The scripted model invented numbers twice, so both summaries are the template.
    expect(model.deltaRequests).toHaveLength(4);
    expect(delta?.summary).toMatch(/moved in October 2026|in line with September 2026/);
    expect(delta?.summary).toMatch(/committed actions/);
    expect(store.analyses.get(`g2/${MONTH}`)?.delta?.committedActions).toEqual([]);
  });
});
