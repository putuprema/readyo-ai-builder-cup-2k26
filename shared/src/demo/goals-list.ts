import { firestorePaths } from "../paths.js";
import { plainJson } from "../plain.js";
import type { Estimate, Goal, RunStatus } from "../types.js";
import { DEMO_MONTH, DEMO_UID, demoAnalysis, demoGoal, type SeedDocument } from "./index.js";

// Extra goals for the goals list (specs/12-ui-goals-list.md): with the demo's active house
// goal they make one analysing, two drafts and two active goals. Emulator use only
// (`pnpm seed:demo:emulator -- --goals-list`): the analysing goal's run never finishes, and
// the second active goal reuses the first goal's analysis, so its numbers are sample data.

export const GOALS_LIST_IDS = {
  analysing: "house-bogor",
  draftEstimate: "house-bandung",
  draftDocuments: "house-depok",
  secondActive: "house-bekasi",
} as const;

const demoEstimate = demoGoal.estimate as Estimate;

const minutesBefore = (now: Date, minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString();

/** The goal documents, timed relative to `now` so "Saved 5 min ago" reads right after seeding. */
export function goalsListGoals(now: Date): Goal[] {
  return [
    {
      id: GOALS_LIST_IDS.analysing,
      type: "house",
      status: "analysing",
      payPreference: "loan",
      inputs: {
        area: "Bogor",
        propertyType: "landed",
        market: "secondary",
        firstHome: true,
        targetYear: 2029,
      },
      estimate: { ...demoEstimate, targetToday: 820_000_000, targetAtGoalDate: 976_000_000 },
      createdAt: minutesBefore(now, 20),
      updatedAt: minutesBefore(now, 1),
    },
    {
      id: GOALS_LIST_IDS.draftEstimate,
      type: "house",
      status: "draft",
      draftStep: "estimate",
      payPreference: "loan",
      inputs: {
        area: "Bandung",
        propertyType: "apartment",
        market: "new",
        firstHome: true,
        targetYear: 2030,
      },
      createdAt: minutesBefore(now, 5),
      updatedAt: minutesBefore(now, 5),
    },
    {
      id: GOALS_LIST_IDS.draftDocuments,
      type: "house",
      status: "draft",
      draftStep: "documents",
      payPreference: "cash",
      inputs: {
        area: "Depok",
        propertyType: "landed",
        market: "new",
        firstHome: true,
        targetYear: 2031,
      },
      estimate: { ...demoEstimate, targetToday: 700_000_000, targetAtGoalDate: 884_000_000 },
      createdAt: minutesBefore(now, 2 * 24 * 60),
      updatedAt: minutesBefore(now, 2 * 24 * 60),
    },
    {
      ...demoGoal,
      id: GOALS_LIST_IDS.secondActive,
      inputs: { ...demoGoal.inputs, area: "Bekasi" },
      createdAt: "2026-10-02T10:00:00.000Z",
      updatedAt: "2026-10-02T10:30:00.000Z",
    },
  ];
}

/** The analysing goal's run: stopped at "checking" so the card shows step 3 of 4. */
export function goalsListRun(now: Date): RunStatus {
  return {
    id: "run-house-bogor",
    stage: "checking",
    percent: 71,
    startedAt: minutesBefore(now, 1),
    goalIds: [GOALS_LIST_IDS.analysing],
    month: DEMO_MONTH,
    kind: "reuse",
  };
}

/** Documents to add on top of demoSeedDocuments() for the goals-list demo. */
export function goalsListSeedDocuments(uid: string = DEMO_UID, now = new Date()): SeedDocument[] {
  const plain = (v: object) => plainJson(v) as Record<string, unknown>;
  const docs: SeedDocument[] = goalsListGoals(now).map((g) => ({
    path: firestorePaths.goal(uid, g.id),
    data: plain(g),
  }));
  const run = goalsListRun(now);
  docs.push({ path: firestorePaths.run(uid, run.id), data: plain(run) });
  docs.push({
    path: firestorePaths.analysis(uid, GOALS_LIST_IDS.secondActive, DEMO_MONTH),
    data: plain({ ...demoAnalysis, goalId: GOALS_LIST_IDS.secondActive }),
  });
  return docs;
}
