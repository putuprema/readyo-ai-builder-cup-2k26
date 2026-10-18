import { demoGoal } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { deltaView } from "./delta";
import { sampleDelta } from "./dev/sample-delta";

describe("deltaView", () => {
  const view = deltaView(demoGoal, sampleDelta);

  it("names the previous month and keeps the stored summary", () => {
    expect(view.title).toBe("Since September");
    expect(view.summary).toBe(sampleDelta.summary);
  });

  it("compares the months to ready on the leading path", () => {
    expect(view).toMatchObject({
      monthsLabel: "Months to a KPR",
      monthsFrom: "14 months",
      monthsTo: "11 months",
      trend: "better",
      trendText: "3 months sooner",
    });
  });

  it("formats each changed metric like the readiness table", () => {
    expect(view.metrics[0]).toMatchObject({
      label: "Debt-to-income",
      from: "38%",
      to: "33%",
      fromStatusLabel: "Blocks",
      toStatusLabel: "Passes",
      statusChanged: true,
    });
    expect(view.metrics[1]).toMatchObject({
      from: "2.1 months",
      to: "2.6 months",
      statusChanged: false,
    });
  });

  it("drops a stored metric row whose values read the same", () => {
    const flat = deltaView(demoGoal, {
      ...sampleDelta,
      metricsChanged: [
        {
          id: "goal_progress",
          label: "Down payment progress",
          oldValue: 0.262,
          newValue: 0.258,
          oldStatus: "needs_work",
          newStatus: "needs_work",
        },
      ],
    });
    expect(flat.metrics).toEqual([]);
  });

  it("lists committed actions as kept or not, with the evidence", () => {
    expect(view.actions.map((a) => [a.title, a.kept, a.evidence])).toEqual([
      ["Pay off Kredivo", true, "Kredivo balance gone"],
      ["Cap shopping at Rp 1.5 m", false, "Shopping Rp 1.9 m, above the Rp 1.5 m cap"],
    ]);
  });

  it("reads a slip and an unchanged count", () => {
    const later = deltaView(demoGoal, {
      ...sampleDelta,
      monthsToReady: { leadingPath: "cash", old: 20, new: 21 },
    });
    expect(later).toMatchObject({
      monthsLabel: "Months to ready",
      trend: "worse",
      trendText: "1 month later",
    });
    const same = deltaView(demoGoal, {
      ...sampleDelta,
      monthsToReady: { leadingPath: "loan", old: null, new: null },
    });
    expect(same).toMatchObject({ trend: "same", trendText: "No change" });
    const reach = deltaView(demoGoal, {
      ...sampleDelta,
      monthsToReady: { leadingPath: "loan", old: null, new: 40 },
    });
    expect(reach).toMatchObject({ trend: "better", trendText: "Now within reach" });
  });
});
