import { firebaseAuth } from "./firebase";

// Calls to the api service (specs/01-contracts.md). Every call carries the signed-in user's
// Firebase ID token; the api answers 401 without one. Reads (goals, run status, analyses) do
// not go through here: the pages listen to Firestore directly.

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    /** The api's `error` code: `invalid_request`, `not_found`, `goal_not_priced`, ... */
    public readonly code: string,
    message: string,
    public readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorBody {
  error?: string;
  message?: string;
  issues?: { path: string; message: string }[];
}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const user = firebaseAuth().currentUser;
  if (!user) throw new ApiError(401, "unauthorized", "Sign in first");
  const token = await user.getIdToken();

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(0, "network", "Could not reach the server. Check your connection.");
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const err = (body ?? {}) as ErrorBody;
    throw new ApiError(
      res.status,
      err.error ?? `http_${res.status}`,
      err.message ?? defaultMessage(res.status),
      err.issues,
    );
  }
  return body as T;
}

function defaultMessage(status: number): string {
  if (status === 401) return "Your session expired. Sign in again.";
  if (status === 404) return "Not found.";
  if (status === 501) return "This part of the service is not available yet.";
  if (status >= 500) return "The server had a problem. Try again in a moment.";
  return "The request was refused.";
}
