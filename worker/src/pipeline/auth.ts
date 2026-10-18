import { OAuth2Client } from "google-auth-library";

// Cloud Tasks calls the worker with an OIDC token for the invoker service account (audience: the
// worker's URL). Cloud Run already requires roles/run.invoker on the service; this check is the
// application-level half: the token must be valid, issued by Google for our audience, and (when
// configured) for the expected service account. Tests pass a fake client.

export type TaskVerification = { ok: true; email?: string } | { ok: false; reason: string };

export type TaskVerifier = (authorization: string | undefined) => Promise<TaskVerification>;

export interface TaskAuthConfig {
  /** The worker's own URL, as Cloud Tasks puts it in the token. */
  audience: string;
  /** When set, only tokens for this service account are accepted. */
  serviceAccountEmail?: string;
}

const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export function cloudTasksVerifier(
  config: TaskAuthConfig,
  client: Pick<OAuth2Client, "verifyIdToken"> = new OAuth2Client(),
): TaskVerifier {
  return async (authorization) => {
    const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
    if (!match?.[1]) return { ok: false, reason: "missing bearer token" };
    try {
      const ticket = await client.verifyIdToken({ idToken: match[1], audience: config.audience });
      const payload = ticket.getPayload();
      if (!payload) return { ok: false, reason: "token has no payload" };
      if (!GOOGLE_ISSUERS.has(payload.iss)) return { ok: false, reason: "unexpected issuer" };
      if (config.serviceAccountEmail) {
        if (payload.email !== config.serviceAccountEmail || !payload.email_verified) {
          return { ok: false, reason: "token is not for the invoker service account" };
        }
      }
      return { ok: true, ...(payload.email ? { email: payload.email } : {}) };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : "invalid token" };
    }
  };
}

/** Accepts every request; for local development and the emulators only (TASKS_AUTH=off). */
export const allowAllTasks: TaskVerifier = async () => ({ ok: true });

export function taskVerifierFromEnv(env: NodeJS.ProcessEnv = process.env): TaskVerifier {
  if (env.TASKS_AUTH === "off") {
    console.warn("TASKS_AUTH=off: the run endpoint accepts unauthenticated requests");
    return allowAllTasks;
  }
  const audience = env.TASKS_AUDIENCE ?? env.WORKER_URL;
  if (!audience) {
    throw new Error("Set TASKS_AUDIENCE (the worker's URL) or TASKS_AUTH=off for local runs");
  }
  return cloudTasksVerifier({
    audience,
    ...(env.TASKS_SERVICE_ACCOUNT ? { serviceAccountEmail: env.TASKS_SERVICE_ACCOUNT } : {}),
  });
}
