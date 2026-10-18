import { demoGoal, goalsListGoals } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { deleteErrorMessage, deleteLabel, deleteMode } from "./delete";

describe("deleteMode", () => {
  it("deletes drafts at once, confirms active goals, and offers nothing while analysing", () => {
    expect(deleteMode({ status: "draft" })).toBe("immediate");
    expect(deleteMode({ status: "active" })).toBe("confirm");
    expect(deleteMode({ status: "analysing" })).toBe("none");
  });
});

describe("deleteLabel", () => {
  it("names the goal for screen readers", () => {
    const draft = goalsListGoals(new Date())[1];
    if (!draft) throw new Error("seed has drafts");
    expect(deleteLabel(draft)).toBe("Delete draft: Buy a house, Bandung");
    expect(deleteLabel(demoGoal)).toBe("Delete goal: Buy a house, Tangerang Selatan");
  });
});

describe("deleteErrorMessage", () => {
  it("explains the api's refusal for an analysing goal", () => {
    expect(deleteErrorMessage("goal_analysing")).toMatch(/being analysed/);
    expect(deleteErrorMessage("http_500")).toMatch(/could not be deleted/);
  });
});
