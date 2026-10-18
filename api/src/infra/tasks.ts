import { CloudTasksClient } from "@google-cloud/tasks";
import type { RunTask, TaskQueue } from "../runs/ports.js";

// Two task queues. `cloudTasksQueue` is the Cloud Run one: one HTTP task per run, named after
// the runId so Cloud Tasks drops a duplicate enqueue, carrying an OIDC token the worker checks.
// `directWorkerQueue` is for local development and the emulators: it POSTs to the worker at once
// and does not wait for the run to finish.

export interface CloudTasksConfig {
  projectId: string;
  location: string;
  queue: string;
  workerUrl: string;
  /** The service account whose OIDC token the task carries (needs roles/run.invoker on the worker). */
  serviceAccountEmail: string;
  /** How long the worker may take for one attempt; Cloud Tasks allows 15 s to 30 min. */
  dispatchDeadlineSeconds?: number;
}

const ALREADY_EXISTS = 6;

export function cloudTasksQueue(
  config: CloudTasksConfig,
  client: CloudTasksClient = new CloudTasksClient(),
): TaskQueue {
  const parent = client.queuePath(config.projectId, config.location, config.queue);
  return {
    async enqueue(task: RunTask) {
      try {
        await client.createTask({
          parent,
          task: {
            name: `${parent}/tasks/${task.runId}`,
            dispatchDeadline: { seconds: config.dispatchDeadlineSeconds ?? 1800 },
            httpRequest: {
              httpMethod: "POST",
              url: runUrl(config.workerUrl),
              headers: { "Content-Type": "application/json" },
              body: Buffer.from(JSON.stringify(task)).toString("base64"),
              oidcToken: {
                serviceAccountEmail: config.serviceAccountEmail,
                audience: config.workerUrl,
              },
            },
          },
        });
      } catch (error) {
        if ((error as { code?: number }).code === ALREADY_EXISTS) return;
        throw error;
      }
    },
  };
}

export function directWorkerQueue(
  workerUrl: string,
  fetchImpl: typeof fetch = fetch,
  log: (message: string) => void = console.warn,
): TaskQueue {
  return {
    async enqueue(task: RunTask) {
      // Fire and forget: the worker takes minutes and reports through the run document.
      fetchImpl(runUrl(workerUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(task),
      })
        .then((res) => {
          if (!res.ok) log(`run ${task.runId}: worker answered ${res.status}`);
        })
        .catch((error: unknown) => {
          log(`run ${task.runId}: worker unreachable: ${String(error)}`);
        });
    },
  };
}

/** The worker's run endpoint. */
export function runUrl(workerUrl: string): string {
  return `${workerUrl.replace(/\/$/, "")}/runs`;
}

/** Reads the queue configuration from the environment; null when runs are not configured. */
export function taskQueueFromEnv(env: NodeJS.ProcessEnv = process.env): TaskQueue | null {
  const workerUrl = env.WORKER_URL;
  if (!workerUrl) return null;
  if (env.TASKS_MODE === "direct") return directWorkerQueue(workerUrl);
  const projectId = env.GOOGLE_CLOUD_PROJECT ?? env.FIREBASE_PROJECT_ID;
  const queue = env.TASKS_QUEUE;
  const serviceAccountEmail = env.TASKS_SERVICE_ACCOUNT;
  if (!projectId || !queue || !serviceAccountEmail) {
    throw new Error(
      "Cloud Tasks needs GOOGLE_CLOUD_PROJECT, TASKS_QUEUE and TASKS_SERVICE_ACCOUNT (or TASKS_MODE=direct)",
    );
  }
  return cloudTasksQueue({
    projectId,
    location: env.TASKS_LOCATION ?? "asia-southeast1",
    queue,
    workerUrl,
    serviceAccountEmail,
  });
}
