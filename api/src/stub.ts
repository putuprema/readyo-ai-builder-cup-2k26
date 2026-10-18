import type { Context } from "hono";

/** Reply for an endpoint whose validation and auth exist but whose logic is a later spec. */
export function notImplemented(c: Context, operation: string, accepted: Record<string, unknown>) {
  return c.json({ error: "not_implemented", operation, accepted }, 501);
}
