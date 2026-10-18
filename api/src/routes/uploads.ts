import { Hono } from "hono";
import type { AuthEnv } from "../auth.js";
import { createUploadBody, docIdParam } from "../schemas.js";
import { notImplemented } from "../stub.js";
import { parse, parseBody } from "../validate.js";

// Upload endpoints: a signed Cloud Storage URL per file plus a `documents` record.
// Stubs until spec 10 (documents step).

export const uploads = new Hono<AuthEnv>();

uploads.post("/", async (c) => {
  const body = await parseBody(c, createUploadBody);
  return notImplemented(c, "create upload", { name: body.name, sourceKind: body.sourceKind });
});

uploads.delete("/:docId", (c) => {
  const { docId } = parse(c.req.param(), docIdParam);
  return notImplemented(c, "delete upload", { docId });
});
