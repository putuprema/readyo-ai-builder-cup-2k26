import type { Goal, GoalStatus, GoalType } from "@adidi/shared";

// The goals list's selection and wording (specs/12-ui-goals-list.md, docs/screens.md "4").
// Pure, so ordering, counts and the subtitle are unit-tested.

export type GoalFilter = "all" | "active" | "drafts";

const GROUP_RANK: Record<GoalStatus, number> = { analysing: 0, draft: 1, active: 2 };

/** Analysing first, then drafts, then active; newest first (by creation) within each group. */
export function orderGoals(goals: readonly Goal[]): Goal[] {
  return [...goals].sort(
    (a, b) =>
      GROUP_RANK[a.status] - GROUP_RANK[b.status] ||
      b.createdAt.localeCompare(a.createdAt) ||
      a.id.localeCompare(b.id),
  );
}

export interface GoalCounts {
  all: number;
  analysing: number;
  draft: number;
  active: number;
}

export function goalCounts(goals: readonly Goal[]): GoalCounts {
  const counts: GoalCounts = { all: goals.length, analysing: 0, draft: 0, active: 0 };
  for (const g of goals) counts[g.status] += 1;
  return counts;
}

/** "1 being analysed, 2 drafts to finish, 2 active and tracked monthly." Empty groups drop out. */
export function countsSubtitle(counts: GoalCounts): string {
  const parts: string[] = [];
  if (counts.analysing > 0) parts.push(`${counts.analysing} being analysed`);
  if (counts.draft > 0)
    parts.push(`${counts.draft} ${counts.draft === 1 ? "draft" : "drafts"} to finish`);
  if (counts.active > 0) parts.push(`${counts.active} active and tracked monthly`);
  return parts.length > 0 ? `${parts.join(", ")}.` : "";
}

/** All shows every goal; Active and Drafts show their own status only (analysing goals: All). */
export function filterGoals(goals: readonly Goal[], filter: GoalFilter): Goal[] {
  switch (filter) {
    case "all":
      return [...goals];
    case "active":
      return goals.filter((g) => g.status === "active");
    case "drafts":
      return goals.filter((g) => g.status === "draft");
  }
}

export function filterCount(counts: GoalCounts, filter: GoalFilter): number {
  return filter === "all" ? counts.all : filter === "active" ? counts.active : counts.draft;
}

export const GOAL_TITLE: Record<GoalType, string> = {
  house: "Buy a house",
  car: "Buy a car",
  wedding: "Wedding",
};

/** "40 s ago", "5 min ago", "3 h ago", "2 days ago"; past a week, "on 3 Oct". */
export function timeAgo(iso: string, now: Date): string {
  const then = new Date(iso);
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? "1 day ago" : `${days} days ago`;
  const month = then.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `on ${then.getUTCDate()} ${month}`;
}
