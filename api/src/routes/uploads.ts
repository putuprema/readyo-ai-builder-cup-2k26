import { Hono } from "hono";
import type { AuthEnv } from "../auth.js";
import { createUploadBody, docIdParam } from "../schemas.js";
import { notImplemented } from "../stub.js";
import {
  createUpload,
  deleteUpload,
  putUploadContent,
  type UploadDeps,
} from "../uploads/uploads.js";
import { parse, parseBody } from "../validate.js";

// Upload endpoints (spec 10): a signed Cloud Storage URL per file plus a `documents` record,
// and removal before Submit. Without the store and the bucket the endpoints answer 501.
// PUT /uploads/:docId/content exists only in "proxy" mode, i.e. on the Storage emulator,
// where signed URLs cannot be produced; on Cloud Run it is not registered.

export function createUploadRoutes(deps?: UploadDeps) {
  const uploads = new Hono<AuthEnv>();

  uploads.post("/", async (c) => {
    const body = await parseBody(c, createUploadBody);
    if (!deps)
      return notImplemented(c, "create upload", { name: body.name, sourceKind: body.sourceKind });
    const outcome = await createUpload(c.get("user").uid, body, new URL(c.req.url).origin, deps);
    return c.json(outcome.body, outcome.status === 204 ? 200 : outcome.status);
  });

  if (deps?.mode === "proxy") {
    // Emulator-only: the browser PUTs the file here instead of to a signed URL.
    uploads.put("/:docId/content", async (c) => {
      const { docId } = parse(c.req.param(), docIdParam);
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      const outcome = await putUploadContent(
        c.get("user").uid,
        docId,
        bytes,
        c.req.header("Content-Type"),
        deps,
      );
      return c.json(outcome.body, outcome.status === 204 ? 200 : outcome.status);
    });
  }

  uploads.delete("/:docId", async (c) => {
    const { docId } = parse(c.req.param(), docIdParam);
    if (!deps) return notImplemented(c, "delete upload", { docId });
    const outcome = await deleteUpload(c.get("user").uid, docId, deps);
    if (outcome.status === 204) return c.body(null, 204);
    return c.json(outcome.body, outcome.status);
  });

  return uploads;
}
