import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { FakeUserDataStore, FakeUserFiles } from "./fakes.js";

// DELETE /me/data against the fakes (docs/product.md, "Privacy"): everything under
// users/{uid} and the user's files go, counted; another user's data and the Auth account stay;
// a running analysis blocks it.

const NOW = new Date("2026-10-18T09:30:00.000Z");

function filledStore() {
  return new FakeUserDataStore()
    .set("users/u1", { age: 29 })
    .set("users/u1/goals/g1", { status: "active" })
    .set("users/u1/goals/g1/analyses/2026-08")
    .set("users/u1/goals/g1/analyses/2026-09")
    .set("users/u1/goals/g2", { status: "draft" })
    .set("users/u1/months/2026-09")
    .set("users/u1/transactions/t1")
    .set("users/u1/transactions/t2")
    .set("users/u1/transactions/t3")
    .set("users/u1/loans/l1")
    .set("users/u1/holdings/h1")
    .set("users/u1/holdings/h2")
    .set("users/u1/documents/d1", { status: "uploaded" })
    .set("users/u1/runs/r1", { stage: "done", updatedAt: "2026-10-01T00:00:00.000Z" })
    .set("users/u1/overrides/dti_cap", { value: 0.35 })
    .set("users/u2", { age: 40 })
    .set("users/u2/goals/g9", { status: "active" });
}

function setup(store = filledStore()) {
  const files = new FakeUserFiles(
    new Set(["users/u1/documents/d1", "users/u1/documents/d2", "users/u2/documents/d9"]),
  );
  const app = createApp({
    verifyToken: async (token) => (token === "u1" || token === "u2" ? { uid: token } : null),
    log: false,
    account: { store, files, now: () => NOW },
  });
  const del = (token = "u1") =>
    app.request("/me/data", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  return { store, files, del };
}

describe("DELETE /me/data", () => {
  it("deletes everything under users/{uid} and the user's files, with counts", async () => {
    const { store, files, del } = setup();
    const res = await del();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deleted: {
        profile: 1,
        goals: 2,
        analyses: 2,
        months: 1,
        transactions: 3,
        loans: 1,
        holdings: 2,
        documents: 1,
        runs: 1,
        overrides: 1,
        files: 2,
      },
    });
    expect([...store.docs.keys()].filter((p) => p.startsWith("users/u1"))).toEqual([]);
    expect([...files.paths]).toEqual(["users/u2/documents/d9"]);
  });

  it("leaves another user's data alone", async () => {
    const { store, del } = setup();
    await del();
    expect(store.docs.has("users/u2")).toBe(true);
    expect(store.docs.has("users/u2/goals/g9")).toBe(true);
  });

  it("answers zeros for an empty tree but still removes leftover files", async () => {
    const { files, del } = setup(new FakeUserDataStore());
    const res = await del();
    expect(res.status).toBe(200);
    const { files: removed, ...records } = (
      (await res.json()) as {
        deleted: Record<string, number>;
      }
    ).deleted;
    expect(Object.values(records).every((n) => n === 0)).toBe(true);
    expect(removed).toBe(2);
    expect(files.paths.size).toBe(1);
  });

  it("refuses with 409 while a goal is analysing", async () => {
    const store = filledStore()
      .set("users/u1/goals/g3", { status: "analysing" })
      .set("users/u1/runs/r3", { stage: "reading", updatedAt: "2026-10-18T09:29:00.000Z" });
    const { del } = setup(store);
    const res = await del();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "run_in_progress" });
    expect(store.docs.has("users/u1/goals/g1")).toBe(true);
  });

  it("refuses with 409 while a recent run has not finished", async () => {
    const store = filledStore().set("users/u1/runs/r2", {
      stage: "planning",
      updatedAt: "2026-10-18T09:25:00.000Z",
    });
    const { files, del } = setup(store);
    expect((await del()).status).toBe(409);
    expect(files.paths.size).toBe(3);
  });

  it("does not let a run stuck for over an hour block the delete, nor the goal it left analysing", async () => {
    const store = filledStore()
      .set("users/u1/goals/g3", { status: "analysing" })
      .set("users/u1/runs/r2", { stage: "reading", updatedAt: "2026-10-18T07:00:00.000Z" });
    const { del } = setup(store);
    expect((await del()).status).toBe(200);
  });

  it("works without a bucket and reports no files", async () => {
    const store = filledStore();
    const app = createApp({
      verifyToken: async () => ({ uid: "u1" }),
      log: false,
      account: { store, now: () => NOW },
    });
    const res = await app.request("/me/data", {
      method: "DELETE",
      headers: { Authorization: "Bearer x" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deleted: { files: 0, goals: 2 } });
  });
});
