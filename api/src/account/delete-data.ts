import type { DeletedCounts, UserDataStore, UserFiles } from "./ports.js";
import { userStoragePrefix } from "./ports.js";

// DELETE /me/data (docs/product.md, "Privacy": the user can delete all their data at any
// time). Removes everything under users/{uid} in Firestore and the user's files in Cloud
// Storage, keeps the Auth account, and refuses while a run is analysing: the worker would
// write the goal back half-way through.

export interface DeleteDataDeps {
  store: UserDataStore;
  /** The bucket; without one (no STORAGE_BUCKET) there are no files to remove. */
  files?: UserFiles;
  now?: () => Date;
}

/**
 * A run that has not moved for this long is treated as dead (its task gave up without
 * marking it failed), so it no longer blocks the delete. The worker's whole pipeline takes
 * a few minutes.
 */
export const STALE_RUN_MS = 60 * 60 * 1000;

export type DeleteDataOutcome =
  | { status: 200; body: { deleted: DeletedCounts } }
  | { status: 409; body: { error: string; message: string } };

export async function deleteAllData(uid: string, deps: DeleteDataDeps): Promise<DeleteDataOutcome> {
  const now = (deps.now ?? (() => new Date()))().getTime();
  const [statuses, runs] = await Promise.all([
    deps.store.listGoalStatuses(uid),
    deps.store.listRuns(uid),
  ]);
  const running = runs.some(
    (r) =>
      r.stage !== "done" &&
      r.stage !== "failed" &&
      now - new Date(r.updatedAt).getTime() < STALE_RUN_MS,
  );
  if (running || statuses.includes("analysing")) {
    return {
      status: 409,
      body: {
        error: "run_in_progress",
        message: "An analysis is running. You can delete your data once it finishes.",
      },
    };
  }

  const counts = await deps.store.countUserData(uid);
  await deps.store.deleteUserData(uid);
  const files = deps.files ? await deps.files.deletePrefix(userStoragePrefix(uid)) : 0;
  return { status: 200, body: { deleted: { ...counts, files } } };
}
