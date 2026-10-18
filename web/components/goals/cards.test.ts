import type { Analysis, Goal } from "@adidi/shared";
import { demoAnalysis, demoGoal, goalsListGoals } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { activeModel, analysingModel, cardSummary, draftModel } from "./cards";

const NOW = new Date("2026-10-18T10:00:00Z");
const [analysing, draftEstimate, draftDocuments] = goalsListGoals(NOW) as [Goal, Goal, Goal];

describe("cardSummary", () => {
  it("describes an active house goal with its target", () => {
    expect(cardSummary(demoGoal)).toBe(
      "Landed, 72/60 m², Tangerang Selatan · KPR · target Rp 1.52 bn in 2028",
    );
  });

  it("says when a draft has no estimate yet", () => {
    expect(cardSummary(draftEstimate)).toBe("Apartment, Bandung · KPR · no estimate yet · 2030");
  });

  it("shows a draft's estimate and cash preference", () => {
    expect(cardSummary(draftDocuments)).toBe("Landed, Depok · cash · estimate Rp 884 m · 2031");
  });
});

describe("draftModel", () => {
  it("resumes the estimate step on the goal form", () => {
    expect(draftModel(draftEstimate)).toEqual({
      step: 1,
      next: "Next: calculate the target",
      segments: ["current", "todo", "todo"],
      continueHref: "/goals/new/?id=house-bandung",
    });
  });

  it("asks to review the target when the estimate step already has an estimate", () => {
    expect(draftModel({ ...draftDocuments, draftStep: "estimate" })).toMatchObject({
      step: 1,
      next: "Next: review the target",
    });
  });

  it("resumes the documents step", () => {
    expect(draftModel(draftDocuments)).toMatchObject({
      step: 2,
      next: "Next: add documents",
      segments: ["done", "current", "todo"],
      continueHref: "/goals/house-depok/documents/",
    });
  });

  it("falls back on the estimate when draftStep is missing", () => {
    const { draftStep: _, ...priced } = draftDocuments;
    expect(draftModel(priced as Goal).step).toBe(2);
    const { draftStep: __, ...unpriced } = draftEstimate;
    expect(draftModel(unpriced as Goal).step).toBe(1);
  });
});

describe("analysingModel", () => {
  it("names the step from the run document", () => {
    expect(analysingModel({ stage: "checking", percent: 71 })).toEqual({
      stage: "Step 3 of 4 · Checking the rules",
      percent: 71,
    });
    expect(analysingModel({ stage: "reading", percent: 18 }).stage).toBe("Step 1 of 4 · Reading");
  });

  it("handles a missing, finished or failed run", () => {
    expect(analysingModel(null)).toEqual({ stage: "Starting", percent: 0 });
    expect(analysingModel({ stage: "done", percent: 100 }).stage).toBe("Step 4 of 4 · Finishing");
    expect(analysingModel({ stage: "failed", percent: 42 }).stage).toBe("Stopped");
  });
});

describe("activeModel", () => {
  it("leads with the KPR months from the plan and the blockers from today", () => {
    const model = activeModel(demoGoal, demoAnalysis);
    expect(model.dataMonth).toBe("September 2026 data");
    expect(model.status.tone).toBe(
      demoAnalysis.withoutPlan.loan?.approvableToday ? "passes" : "blocked",
    );
    if (model.status.tone === "blocked") expect(model.status.text).toMatch(/^Blocked today: /);
    const months = demoAnalysis.withPlan.loan?.monthsToReady;
    expect(model.figure).toBe(months === 0 ? "Now" : `${months} mo`);
  });

  it("uses the choices once made", () => {
    const loan = demoAnalysis.withPlan.loan;
    if (!loan) throw new Error("demo has a loan path");
    const withChoices = { ...demoAnalysis.withPlan, loan: { ...loan, monthsToReady: 14 } };
    const model = activeModel(demoGoal, { ...demoAnalysis, withChoices } as Analysis);
    expect(model).toMatchObject({ figure: "14 mo", unit: "to a KPR with the plan" });
  });

  it("leads with the cash path when the person prefers cash", () => {
    const model = activeModel({ ...demoGoal, payPreference: "cash" }, demoAnalysis);
    expect(model.unit).toMatch(/to buy in cash with the plan|ready with the plan/);
    expect(model.status.tone).not.toBe("blocked");
  });

  it("writes long horizons in years", () => {
    const cash = { ...demoAnalysis.withPlan.cash, monthsToReady: 216 };
    const model = activeModel(
      { ...demoGoal, payPreference: "cash" },
      { ...demoAnalysis, withPlan: { ...demoAnalysis.withPlan, cash } },
    );
    expect(model.figure).toBe("18 yrs");
  });
});

it("analysing seed goal is a house", () => {
  expect(analysing.status).toBe("analysing");
});
