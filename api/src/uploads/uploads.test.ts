import type { DocumentRecord } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { FakeUploadStorage, FakeUploadStore } from "./fakes.js";
import { storagePathFor } from "./ports.js";
import type { UploadMode } from "./uploads.js";

// POST /uploads, PUT /uploads/:docId/content and DELETE /uploads/:docId against the fakes
// (specs/10-ui-goal-creation.md, "Documents step"): a record per file, a signed URL on Cloud
// Run, the proxy route on the emulators only, and removal that deletes the file.

const NOW = new Date("2026-10-18T09:30:00.000Z");

const body = {
  name: "BCA_eStatement_Sep2026.pdf",
  type: "application/pdf",
  size: 3,
  sourceKind: "bank",
  month: "2026-09",
};

function setup(mode: UploadMode, store = new FakeUploadStore()) {
  const storage = new FakeUploadStorage();
  let n = 0;
  const app = createApp({
    verifyToken: async (token) =>
      token === "u1" ? { uid: "u1" } : token === "u2" ? { uid: "u2" } : null,
    log: false,
    uploads: { store, storage, mode, now: () => NOW, newDocumentId: () => `doc_${++n}` },
  });
  const call = (
    method: string,
    path: string,
    options: { json?: unknown; raw?: Uint8Array; contentType?: string; token?: string } = {},
  ) =>
    app.request(`http://api.test${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${options.token ?? "u1"}`,
        ...(options.json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.contentType ? { "Content-Type": options.contentType } : {}),
      },
      body:
        options.json !== undefined
          ? JSON.stringify(options.json)
          : options.raw
            ? (options.raw as BodyInit)
            : undefined,
    });
  return { app, call, store, storage };
}

describe("POST /uploads", () => {
  it("creates an uploading record and a signed URL bound to the content type", async () => {
    const { call, store, storage } = setup("signed");
    const res = await call("POST", "/uploads", { json: body });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      docId: "doc_1",
      uploadUrl: "https://storage.example/users/u1/documents/doc_1?signature=fake",
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      expiresAt: "2026-10-18T09:45:00.000Z",
    });
    expect(await store.getDocument("u1", "doc_1")).toEqual({
      id: "doc_1",
      name: body.name,
      type: "application/pdf",
      size: 3,
      sourceKind: "bank",
      month: "2026-09",
      status: "uploading",
      createdAt: NOW.toISOString(),
    } satisfies DocumentRecord);
    expect(storage.signed).toEqual([
      {
        path: storagePathFor("u1", "doc_1"),
        contentType: "application/pdf",
        expires: new Date("2026-10-18T09:45:00.000Z"),
      },
    ]);
  });

  it("points at the api's own content route in proxy mode and signs nothing", async () => {
    const { call, storage } = setup("proxy");
    const res = await call("POST", "/uploads", { json: body });
    expect(res.status).toBe(201);
    expect((await res.json()).uploadUrl).toBe("http://api.test/uploads/doc_1/content");
    expect(storage.signed).toEqual([]);
  });
});

describe("PUT /uploads/:docId/content", () => {
  it("stores the bytes and marks the record uploaded (proxy mode)", async () => {
    const { call, store, storage } = setup("proxy");
    await call("POST", "/uploads", { json: body });
    const res = await call("PUT", "/uploads/doc_1/content", {
      raw: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("uploaded");
    expect(storage.files.get(storagePathFor("u1", "doc_1"))).toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
    });
    expect((await store.getDocument("u1", "doc_1"))?.status).toBe("uploaded");
  });

  it("refuses the wrong content type, a size mismatch and another user's record", async () => {
    const { call } = setup("proxy");
    await call("POST", "/uploads", { json: body });
    const wrongType = await call("PUT", "/uploads/doc_1/content", {
      raw: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
    });
    expect(wrongType.status).toBe(400);
    const wrongSize = await call("PUT", "/uploads/doc_1/content", {
      raw: new Uint8Array([1, 2]),
      contentType: "application/pdf",
    });
    expect(wrongSize.status).toBe(400);
    const foreign = await call("PUT", "/uploads/doc_1/content", {
      raw: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
      token: "u2",
    });
    expect(foreign.status).toBe(404);
  });

  it("is not registered in signed mode", async () => {
    const { call } = setup("signed");
    await call("POST", "/uploads", { json: body });
    const res = await call("PUT", "/uploads/doc_1/content", {
      raw: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /uploads/:docId", () => {
  it("deletes the file and marks the record deleted", async () => {
    const { call, store, storage } = setup("proxy");
    await call("POST", "/uploads", { json: body });
    await call("PUT", "/uploads/doc_1/content", {
      raw: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
    });
    const res = await call("DELETE", "/uploads/doc_1");
    expect(res.status).toBe(204);
    expect(storage.deleted).toEqual([storagePathFor("u1", "doc_1")]);
    expect(storage.files.size).toBe(0);
    expect((await store.getDocument("u1", "doc_1"))?.status).toBe("deleted");
    expect((await call("DELETE", "/uploads/doc_1")).status).toBe(404);
  });

  it("refuses a processed document and another user's document", async () => {
    const store = new FakeUploadStore().addDocument("u1", {
      id: "doc_x",
      name: "a.pdf",
      type: "application/pdf",
      size: 1,
      sourceKind: "bank",
      month: "2026-09",
      status: "extracted",
      createdAt: NOW.toISOString(),
    });
    const { call } = setup("signed", store);
    expect((await call("DELETE", "/uploads/doc_x")).status).toBe(409);
    expect((await call("DELETE", "/uploads/doc_x", { token: "u2" })).status).toBe(404);
  });
});
