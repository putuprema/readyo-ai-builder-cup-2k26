import { demoAnalysis, demoGoal } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { planLine, skippedLine } from "./plan-line";

const undecided = { a1: "undecided", a2: "undecided", a3: "undecided" } as const;

describe("planLine", () => {
  it("describes the whole plan before any choice", () => {
    expect(
      planLine({
        goal: demoGoal,
        analysis: demoAnalysis,
        choices: undecided,
        monthsWithChoices: null,
      }),
    ).toBe("Together they move KPR approval from 24 months to this month. Order matters.");
  });

  it("uses the server's months once a choice is made", () => {
    const line = planLine({
      goal: demoGoal,
      analysis: demoAnalysis,
      choices: { a1: "committed", a2: "undecided", a3: "dismissed" },
      monthsWithChoices: { cash: 170, loan: 2 },
    });
    expect(line).toBe(
      "With your choices: approval in 2 months (this month with all three) · 1 in your plan, 1 skipped.",
    );
  });

  it("says the months are being recalculated until the server answers", () => {
    const line = planLine({
      goal: demoGoal,
      analysis: demoAnalysis,
      choices: { a1: "committed", a2: "undecided", a3: "undecided" },
      monthsWithChoices: null,
    });
    expect(line).toMatch(/approval being recalculated/);
  });

  it("speaks of being ready on the cash path", () => {
    const cashGoal = { ...demoGoal, payPreference: "cash" as const };
    const line = planLine({
      goal: cashGoal,
      analysis: demoAnalysis,
      choices: { a1: "dismissed", a2: "undecided", a3: "undecided" },
      monthsWithChoices: { cash: 190, loan: 3 },
    });
    expect(line).toBe(
      "With your choices: ready in 190 months (160 months with all three) · 0 in your plan, 1 skipped.",
    );
  });
});

describe("skippedLine", () => {
  it("reads the loss from monthsSaved", () => {
    const first = demoAnalysis.actions[0];
    if (!first) throw new Error("the demo has no actions");
    expect(skippedLine(first, demoGoal)).toBe("Without it, approval moves back 21 months.");
    expect(
      skippedLine(
        { ...first, monthsSaved: 0, impactLine: "Clears the DTI cap this month" },
        demoGoal,
      ),
    ).toBe("Without it: clears the DTI cap this month is lost.");
  });
});
