import { Hono } from "hono";
import { type DeleteDataDeps, deleteAllData } from "../account/delete-data.js";
import type { AuthEnv } from "../auth.js";
import { notImplemented } from "../stub.js";

// The signed-in user's own account data. DELETE /me/data removes everything the app stored
// for them and keeps the sign-in account; without a store it answers 501.

export function createMeRoutes(deps?: DeleteDataDeps) {
  const me = new Hono<AuthEnv>();

  me.delete("/data", async (c) => {
    if (!deps) return notImplemented(c, "delete all data", {});
    const outcome = await deleteAllData(c.get("user").uid, deps);
    return c.json(outcome.body, outcome.status);
  });

  return me;
}
