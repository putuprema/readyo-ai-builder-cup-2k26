import type { Context, MiddlewareHandler } from "hono";

export interface AuthUser {
  uid: string;
}

/** Verifies a Firebase ID token. Returns null when the token is missing, malformed or expired. */
export type TokenVerifier = (idToken: string) => Promise<AuthUser | null>;

export type AuthEnv = { Variables: { user: AuthUser } };

/**
 * Requires `Authorization: Bearer <Firebase ID token>` on every request it guards and
 * stores the verified user on the context. Replies 401 otherwise.
 */
export function requireAuth(verify: TokenVerifier): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const header = c.req.header("Authorization") ?? "";
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match?.[1]) return unauthorized(c, "Missing bearer token");

    let user: AuthUser | null = null;
    try {
      user = await verify(match[1]);
    } catch {
      user = null;
    }
    if (!user) return unauthorized(c, "Invalid or expired token");

    c.set("user", user);
    await next();
  };
}

function unauthorized(c: Context, message: string) {
  return c.json({ error: "unauthorized", message }, 401);
}
