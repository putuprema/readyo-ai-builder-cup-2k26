import type { RunStatus } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { createWorkerApp, RETRY_COUNT_HEADER } from "./app.js";
import { allowAllTasks, cloudTasksVerifier, taskVerifierFromEnv } from "./auth.js";
import { FakeRunStore } from "./fakes.js";

// POST /runs on the worker: the OIDC check, the body check, and the retry count header passed
// to the runner.

function setup(verifyTask = allowAllTasks) {
  const store = new FakeRunStore();
  const run: RunStatus = {
    id: "run_1",
    stage: "reading",
    percent: 0,
    startedAt: "2026-10-18T09:59:00.000Z",
    goalIds: [],
    month: "2026-09",
    kind: "reuse",
    attempt: 0,
  };
  store.runs.set("run_1", run);
  const attempts: number[] = [];
  const app = createWorkerApp({
    verifyTask,
    log: false,
    pipeline: {
      store,
      runners: {
        reuse: async (ctx) => {
          attempts.push(ctx.run.attempt ?? -1);
          await ctx.enter("checking");
        },
      },
      log: () => {},
    },
  });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  return { app, store, post, attempts };
}

describe("POST /runs (worker)", () => {
  it("runs the pipeline and answers 200", async () => {
    const { post, store } = setup();
    const res = await post({ uid: "u1", runId: "run_1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, runId: "run_1", stage: "done" });
    expect(store.stagesSeen()).toEqual(["checking", "done"]);
  });

  it("passes the Cloud Tasks retry count on as the attempt", async () => {
    const { post, store } = setup();
    await post({ uid: "u1", runId: "run_1" }, { [RETRY_COUNT_HEADER]: "2" });
    expect(store.runs.get("run_1")?.attempt).toBe(3);
  });

  it("rejects a request the verifier refuses", async () => {
    const { post } = setup(async () => ({ ok: false, reason: "unexpected issuer" }));
    const res = await post({ uid: "u1", runId: "run_1" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthorized" });
  });

  it("rejects a malformed body", async () => {
    const { post } = setup();
    expect((await post("{nope")).status).toBe(400);
    expect((await post({ uid: "u1" })).status).toBe(400);
    expect((await post({ uid: "u1", runId: "run_1", extra: 1 })).status).toBe(400);
  });

  it("leaves /health open", async () => {
    const { app } = setup(async () => ({ ok: false, reason: "no" }));
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, service: "worker" });
  });
});

describe("cloudTasksVerifier", () => {
  function client(payload: Record<string, unknown> | Error, seen: unknown[] = []) {
    return {
      seen,
      client: {
        async verifyIdToken(options: unknown) {
          seen.push(options);
          if (payload instanceof Error) throw payload;
          return { getPayload: () => payload };
        },
      },
    };
  }
  const audience = "https://worker-xyz.a.run.app";
  const invoker = "tasks@adidi.iam.gserviceaccount.com";

  it("accepts a Google-issued token for our audience and service account", async () => {
    const { client: c, seen } = client({
      iss: "https://accounts.google.com",
      email: invoker,
      email_verified: true,
    });
    const verify = cloudTasksVerifier({ audience, serviceAccountEmail: invoker }, c as never);
    expect(await verify("Bearer abc")).toEqual({ ok: true, email: invoker });
    expect(seen[0]).toEqual({ idToken: "abc", audience });
  });

  it("refuses another issuer, another account or an invalid token", async () => {
    const other = cloudTasksVerifier(
      { audience, serviceAccountEmail: invoker },
      client({ iss: "https://example.com", email: invoker, email_verified: true }).client as never,
    );
    expect((await other("Bearer abc")).ok).toBe(false);
    const account = cloudTasksVerifier(
      { audience, serviceAccountEmail: invoker },
      client({ iss: "accounts.google.com", email: "x@y.z", email_verified: true }).client as never,
    );
    expect((await account("Bearer abc")).ok).toBe(false);
    const invalid = cloudTasksVerifier(
      { audience },
      client(new Error("Wrong recipient")).client as never,
    );
    expect(await invalid("Bearer abc")).toEqual({ ok: false, reason: "Wrong recipient" });
  });

  it("refuses a missing or non-bearer header without calling Google", async () => {
    const { client: c, seen } = client({ iss: "accounts.google.com" });
    const verify = cloudTasksVerifier({ audience }, c as never);
    expect((await verify(undefined)).ok).toBe(false);
    expect((await verify("Basic abc")).ok).toBe(false);
    expect(seen).toEqual([]);
  });
});

describe("taskVerifierFromEnv", () => {
  it("needs an audience unless auth is off", () => {
    expect(() => taskVerifierFromEnv({})).toThrow(/TASKS_AUDIENCE/);
    expect(taskVerifierFromEnv({ TASKS_AUTH: "off" })).toBe(allowAllTasks);
    expect(typeof taskVerifierFromEnv({ WORKER_URL: "https://w" })).toBe("function");
  });
});
