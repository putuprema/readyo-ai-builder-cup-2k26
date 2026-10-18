import { describe, expect, it } from "vitest";
import { cloudTasksQueue, directWorkerQueue, runUrl, taskQueueFromEnv } from "./tasks.js";

// The Cloud Tasks adapter against a recording client: one HTTP task named after the runId,
// OIDC token for the worker URL, a duplicate enqueue swallowed. The direct queue posts at once.

function fakeClient() {
  const created: unknown[] = [];
  let fail: { code: number } | undefined;
  const client = {
    queuePath: (p: string, l: string, q: string) => `projects/${p}/locations/${l}/queues/${q}`,
    async createTask(request: unknown) {
      if (fail) throw fail;
      created.push(request);
      return [{}];
    },
  };
  return { client, created, failWith: (code: number) => (fail = { code }) };
}

const config = {
  projectId: "adidi",
  location: "asia-southeast1",
  queue: "runs",
  workerUrl: "https://worker-xyz.a.run.app",
  serviceAccountEmail: "tasks@adidi.iam.gserviceaccount.com",
};

describe("cloudTasksQueue", () => {
  it("creates one named HTTP task with an OIDC token for the worker", async () => {
    const { client, created } = fakeClient();
    const queue = cloudTasksQueue(config, client as never);
    await queue.enqueue({ uid: "u1", runId: "run_1" });

    expect(created).toHaveLength(1);
    const request = created[0] as {
      parent: string;
      task: { name: string; httpRequest: Record<string, unknown> };
    };
    expect(request.parent).toBe("projects/adidi/locations/asia-southeast1/queues/runs");
    expect(request.task.name).toBe(`${request.parent}/tasks/run_1`);
    expect(request.task.httpRequest).toMatchObject({
      httpMethod: "POST",
      url: "https://worker-xyz.a.run.app/runs",
      oidcToken: {
        serviceAccountEmail: config.serviceAccountEmail,
        audience: config.workerUrl,
      },
    });
    const body = JSON.parse(
      Buffer.from(request.task.httpRequest.body as string, "base64").toString("utf8"),
    );
    expect(body).toEqual({ uid: "u1", runId: "run_1" });
  });

  it("treats an already existing task as enqueued", async () => {
    const { client, failWith } = fakeClient();
    failWith(6);
    const queue = cloudTasksQueue(config, client as never);
    await expect(queue.enqueue({ uid: "u1", runId: "run_1" })).resolves.toBeUndefined();
  });

  it("rethrows other errors", async () => {
    const { client, failWith } = fakeClient();
    failWith(14);
    const queue = cloudTasksQueue(config, client as never);
    await expect(queue.enqueue({ uid: "u1", runId: "run_1" })).rejects.toMatchObject({ code: 14 });
  });
});

describe("directWorkerQueue", () => {
  it("posts the task to the worker without waiting for the run", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    let resolveFetch: (r: Response) => void = () => {};
    const fetchImpl = ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    }) as unknown as typeof fetch;
    const queue = directWorkerQueue("http://localhost:8081/", fetchImpl);

    await queue.enqueue({ uid: "u1", runId: "run_1" }); // resolves before the worker answers
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost:8081/runs");
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({ uid: "u1", runId: "run_1" });
    resolveFetch(new Response("{}", { status: 200 }));
  });

  it("logs a failed post instead of throwing", async () => {
    const logs: string[] = [];
    const fetchImpl = (() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;
    const queue = directWorkerQueue("http://localhost:8081", fetchImpl, (m) => logs.push(m));
    await queue.enqueue({ uid: "u1", runId: "run_1" });
    await new Promise((r) => setTimeout(r, 0));
    expect(logs[0]).toMatch(/run_1.*unreachable/);
  });
});

describe("taskQueueFromEnv", () => {
  it("is off without WORKER_URL", () => {
    expect(taskQueueFromEnv({})).toBeNull();
  });

  it("uses the direct queue when TASKS_MODE=direct", () => {
    expect(
      taskQueueFromEnv({ WORKER_URL: "http://localhost:8081", TASKS_MODE: "direct" }),
    ).not.toBeNull();
  });

  it("needs the project, queue and service account for Cloud Tasks", () => {
    expect(() => taskQueueFromEnv({ WORKER_URL: "https://w" })).toThrow(/TASKS_QUEUE/);
  });

  it("builds the run URL without a double slash", () => {
    expect(runUrl("https://w/")).toBe("https://w/runs");
  });
});
