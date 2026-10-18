import type { GoalStatus, RunStage } from "@adidi/shared";
import type { DeletedCounts, UserDataStore, UserFiles } from "./ports.js";

// In-memory versions of the user tree and the bucket for the DELETE /me/data tests. Documents
// are kept as flat paths ("users/u1/goals/g1"), like Firestore's own layout.

export class FakeUserDataStore implements UserDataStore {
  readonly docs = new Map<string, Record<string, unknown>>();

  set(path: string, data: Record<string, unknown> = {}): this {
    this.docs.set(path, data);
    return this;
  }

  private under(uid: string, collection: string): [string, Record<string, unknown>][] {
    const prefix = `users/${uid}/${collection}/`;
    return [...this.docs].filter(
      ([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"),
    );
  }

  async listGoalStatuses(uid: string): Promise<GoalStatus[]> {
    return this.under(uid, "goals").map(([, d]) => d.status as GoalStatus);
  }

  async listRuns(uid: string) {
    return this.under(uid, "runs").map(([, d]) => ({
      stage: d.stage as RunStage,
      updatedAt: d.updatedAt as string,
    }));
  }

  async countUserData(uid: string): Promise<Omit<DeletedCounts, "files">> {
    const count = (c: string) => this.under(uid, c).length;
    const analyses = [...this.docs.keys()].filter((p) =>
      new RegExp(`^users/${uid}/goals/[^/]+/analyses/[^/]+$`).test(p),
    ).length;
    return {
      profile: this.docs.has(`users/${uid}`) ? 1 : 0,
      goals: count("goals"),
      analyses,
      months: count("months"),
      transactions: count("transactions"),
      loans: count("loans"),
      holdings: count("holdings"),
      documents: count("documents"),
      runs: count("runs"),
      overrides: count("overrides"),
    };
  }

  async deleteUserData(uid: string): Promise<void> {
    for (const path of [...this.docs.keys()]) {
      if (path === `users/${uid}` || path.startsWith(`users/${uid}/`)) this.docs.delete(path);
    }
  }
}

export class FakeUserFiles implements UserFiles {
  constructor(readonly paths = new Set<string>()) {}

  async deletePrefix(prefix: string): Promise<number> {
    let n = 0;
    for (const path of [...this.paths]) {
      if (path.startsWith(prefix)) {
        this.paths.delete(path);
        n++;
      }
    }
    return n;
  }
}
