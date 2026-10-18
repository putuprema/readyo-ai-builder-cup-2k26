import type { RunStage } from "@adidi/shared";

// What DELETE /me/data needs from Firestore and Cloud Storage, as two small interfaces so the
// handler is unit-tested with `./fakes.ts`. `../infra/firestore.ts` and `../infra/storage.ts`
// have the firebase-admin versions.

/** How many records of each kind a delete removed (`profile` is 0 or 1). */
export interface DeletedCounts {
  profile: number;
  goals: number;
  analyses: number;
  months: number;
  transactions: number;
  loans: number;
  holdings: number;
  documents: number;
  runs: number;
  overrides: number;
  files: number;
}

export interface UserDataStore {
  /** Every run the user has: its stage and when it last moved. */
  listRuns(uid: string): Promise<{ stage: RunStage; updatedAt: string }[]>;
  /** What is stored under users/{uid}, counted before it is deleted. */
  countUserData(uid: string): Promise<Omit<DeletedCounts, "files">>;
  /** Deletes users/{uid} and everything under it. */
  deleteUserData(uid: string): Promise<void>;
}

export interface UserFiles {
  /** Deletes every file whose path starts with the prefix; resolves with how many. */
  deletePrefix(prefix: string): Promise<number>;
}

/** Where a user's files live in the default bucket (specs/01-contracts.md). */
export function userStoragePrefix(uid: string): string {
  return `users/${uid}/`;
}
