import type { Goal, GoalStatus } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { countsSubtitle, filterCount, filterGoals, goalCounts, orderGoals, timeAgo } from "./list";

function goal(id: string, status: GoalStatus, createdAt: string): Goal {
  return {
    id,
    type: "house",
    status,
    payPreference: "loan",
    inputs: { area: "X", propertyType: "landed", market: "new", firstHome: true, targetYear: 2029 },
    createdAt,
    updatedAt: createdAt,
  };
}

// One analysing, two drafts and two active, in a scrambled order (the spec's seeded user).
const SEEDED = [
  goal("active-old", "active", "2026-10-02T10:00:00Z"),
  goal("draft-old", "draft", "2026-10-16T10:00:00Z"),
  goal("analysing", "analysing", "2026-10-18T09:40:00Z"),
  goal("active-new", "active", "2026-10-03T08:40:00Z"),
  goal("draft-new", "draft", "2026-10-18T09:55:00Z"),
];

describe("orderGoals", () => {
  it("puts analysing, then drafts, then active, newest first within each group", () => {
    expect(orderGoals(SEEDED).map((g) => g.id)).toEqual([
      "analysing",
      "draft-new",
      "draft-old",
      "active-new",
      "active-old",
    ]);
  });

  it("does not reorder the input array", () => {
    const input = [...SEEDED];
    orderGoals(input);
    expect(input).toEqual(SEEDED);
  });
});

describe("counts and filters", () => {
  const counts = goalCounts(SEEDED);

  it("counts each status", () => {
    expect(counts).toEqual({ all: 5, analysing: 1, draft: 2, active: 2 });
  });

  it("writes the subtitle from the counts", () => {
    expect(countsSubtitle(counts)).toBe(
      "1 being analysed, 2 drafts to finish, 2 active and tracked monthly.",
    );
    expect(countsSubtitle({ all: 1, analysing: 0, draft: 1, active: 0 })).toBe(
      "1 draft to finish.",
    );
    expect(countsSubtitle({ all: 0, analysing: 0, draft: 0, active: 0 })).toBe("");
  });

  it("filters by tab and the tab counts match", () => {
    expect(filterGoals(SEEDED, "all")).toHaveLength(5);
    expect(filterGoals(SEEDED, "active").map((g) => g.id)).toEqual(["active-old", "active-new"]);
    expect(filterGoals(SEEDED, "drafts").map((g) => g.id)).toEqual(["draft-old", "draft-new"]);
    expect([
      filterCount(counts, "all"),
      filterCount(counts, "active"),
      filterCount(counts, "drafts"),
    ]).toEqual([5, 2, 2]);
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-18T10:00:00Z");
  it.each([
    ["2026-10-18T09:59:20Z", "40 s ago"],
    ["2026-10-18T09:55:00Z", "5 min ago"],
    ["2026-10-18T07:00:00Z", "3 h ago"],
    ["2026-10-17T09:00:00Z", "1 day ago"],
    ["2026-10-16T10:00:00Z", "2 days ago"],
    ["2026-10-03T08:40:00Z", "on 3 Oct"],
    ["2026-10-18T10:00:05Z", "0 s ago"],
  ])("%s → %s", (iso, text) => {
    expect(timeAgo(iso, now)).toBe(text);
  });
});
