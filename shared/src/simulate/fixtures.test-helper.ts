import { readFileSync } from "node:fs";
import type { Rules } from "../rules.js";
import type { Goal, Profile, Snapshot } from "../types.js";

// Loads the hand-made profiles in fixtures/profiles/ for simulate() tests. Test-only: the
// file name ends in .test-helper.ts so tsc leaves it out of the build (see tsconfig.json).

export interface ProfileFixture {
  name: string;
  description: string;
  snapshot: Snapshot;
  profile: Profile;
  goal: Goal;
}

export type FixtureName = "house-a" | "car-b" | "wedding-c" | "freelancer-d";

const fixturesDir = new URL("../../../fixtures/profiles/", import.meta.url);

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(new URL(file, fixturesDir), "utf8")) as T;
}

export function loadProfile(name: FixtureName): ProfileFixture {
  return readJson<ProfileFixture>(`${name}.json`);
}

/** The rule values the tests run with: a mirror of shared/rules/defaults.json. */
export function loadTestRules(): Rules {
  return readJson<{ rules: Rules }>("rules-test.json").rules;
}

export function loadTestRulesFile(): { note: string; placeholders: string[]; rules: Rules } {
  return readJson("rules-test.json");
}
