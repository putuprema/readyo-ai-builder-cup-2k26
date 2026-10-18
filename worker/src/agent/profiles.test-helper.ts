import { readFileSync } from "node:fs";
import type { Goal, Profile, Rules, Snapshot } from "@adidi/shared";

// Loads fixtures/profiles/*.json for the agent tests (the same files shared/ tests use).
// Test-only: the file name ends in .test-helper.ts so vitest does not treat it as a test.

export interface ProfileFixture {
  name: string;
  description: string;
  snapshot: Snapshot;
  profile: Profile;
  goal: Goal;
}

export type FixtureName = "house-a" | "car-b" | "wedding-c" | "freelancer-d";

const profilesDir = new URL("../../../fixtures/profiles/", import.meta.url);

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(new URL(file, profilesDir), "utf8")) as T;
}

export function loadProfile(name: FixtureName): ProfileFixture {
  return readJson<ProfileFixture>(`${name}.json`);
}

/** The rule values the tests run with: a mirror of shared/rules/defaults.json. */
export function loadTestRules(): Rules {
  return readJson<{ rules: Rules }>("rules-test.json").rules;
}
