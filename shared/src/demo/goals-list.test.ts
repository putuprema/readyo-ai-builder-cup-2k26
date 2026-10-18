import { describe, expect, it } from "vitest";
import { hasUndefined } from "../plain.js";
import { GOALS_LIST_IDS, goalsListGoals, goalsListSeedDocuments } from "./goals-list.js";
import { demoGoal } from "./index.js";

const NOW = new Date("2026-10-18T10:00:00.000Z");

describe("goals-list demo seed", () => {
  it("adds one analysing, two drafts and a second active goal", () => {
    const statuses = goalsListGoals(NOW).map((g) => g.status);
    expect(statuses.filter((s) => s === "analysing")).toHaveLength(1);
    expect(statuses.filter((s) => s === "draft")).toHaveLength(2);
    expect(statuses.filter((s) => s === "active")).toHaveLength(1);
    expect(goalsListGoals(NOW).map((g) => g.id)).not.toContain(demoGoal.id);
  });

  it("covers both draft steps", () => {
    const steps = goalsListGoals(NOW)
      .filter((g) => g.status === "draft")
      .map((g) => g.draftStep);
    expect(steps.sort()).toEqual(["documents", "estimate"]);
  });

  it("gives the analysing goal a running run and the second active goal an analysis", () => {
    const docs = goalsListSeedDocuments("u1", NOW);
    const run = docs.find((d) => d.path.startsWith("users/u1/runs/"));
    expect(run?.data.goalIds).toEqual([GOALS_LIST_IDS.analysing]);
    expect(run?.data.stage).toBe("checking");
    const second = goalsListGoals(NOW).find((g) => g.id === GOALS_LIST_IDS.secondActive);
    expect(
      docs.some(
        (d) =>
          d.path ===
          `users/u1/goals/${GOALS_LIST_IDS.secondActive}/analyses/${second?.latestAnalysisMonth}`,
      ),
    ).toBe(true);
    for (const d of docs) expect(hasUndefined(d.data)).toBe(false);
  });
});
