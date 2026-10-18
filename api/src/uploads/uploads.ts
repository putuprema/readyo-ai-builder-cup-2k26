import type { DocumentRecord } from "@adidi/shared";
import type { CreateUploadBody } from "../schemas.js";
import { storagePathFor, type UploadStorage, type UploadStore } from "./ports.js";

// POST /uploads, PUT /uploads/:docId/content (emulators only) and DELETE /uploads/:docId
// (specs/10-ui-goal-creation.md, "Documents step"). The browser PUTs each file straight to
// Cloud Storage through a V4 signed URL; nothing is read before Submit. firebase-admin cannot
// sign URLs on the emulators (no service account to sign with), so there the api hands out a
// URL to its own content route and streams the bytes into the emulator bucket itself.

export type UploadMode = "signed" | "proxy";

export interface UploadDeps {
  store: UploadStore;
  storage: UploadStorage;
  /** "signed" on Cloud Run; "proxy" with the Storage emulator (FIREBASE_STORAGE_EMULATOR_HOST). */
  mode: UploadMode;
  /** How long a signed URL stays valid. */
  signedUrlMinutes?: number;
  now?: () => Date;
  newDocumentId?: () => string;
}

export interface CreateUploadResponse {
  docId: string;
  /** PUT the file here with the Content-Type sent in the request. */
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

export type UploadOutcome =
  | { status: 201; body: CreateUploadResponse }
  | { status: 200; body: DocumentRecord }
  | { status: 204; body: null }
  | { status: 400 | 404 | 409; body: { error: string; message: string } };

/** Which document statuses a file may still be replaced or removed in. */
const OPEN_STATUSES: DocumentRecord["status"][] = ["uploading", "uploaded", "failed"];

export async function createUpload(
  uid: string,
  body: CreateUploadBody,
  origin: string,
  deps: UploadDeps,
): Promise<UploadOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const docId = (deps.newDocumentId ?? defaultDocumentId)();
  const doc: DocumentRecord = {
    id: docId,
    name: body.name,
    type: body.type,
    size: body.size,
    sourceKind: body.sourceKind,
    month: body.month,
    status: "uploading",
    createdAt: now.toISOString(),
  };
  await deps.store.createDocument(uid, doc);

  const expires = new Date(now.getTime() + (deps.signedUrlMinutes ?? 15) * 60_000);
  const uploadUrl =
    deps.mode === "signed"
      ? await deps.storage.signedUploadUrl(storagePathFor(uid, docId), body.type, expires)
      : `${origin.replace(/\/$/, "")}/uploads/${docId}/content`;
  return {
    status: 201,
    body: {
      docId,
      uploadUrl,
      method: "PUT",
      headers: { "Content-Type": body.type },
      expiresAt: expires.toISOString(),
    },
  };
}

/** The emulator-only proxy: stores the bytes and marks the record uploaded. */
export async function putUploadContent(
  uid: string,
  docId: string,
  bytes: Uint8Array,
  contentType: string | undefined,
  deps: UploadDeps,
): Promise<UploadOutcome> {
  const doc = await deps.store.getDocument(uid, docId);
  if (!doc || doc.status === "deleted") return notFound();
  if (!OPEN_STATUSES.includes(doc.status)) {
    return conflict("document_processed", "This file was already processed");
  }
  if (contentType?.split(";")[0]?.trim() !== doc.type) {
    return bad("content_type", `Expected Content-Type ${doc.type}`);
  }
  if (bytes.byteLength !== doc.size) {
    return bad("size_mismatch", `Expected ${doc.size} bytes, received ${bytes.byteLength}`);
  }
  await deps.storage.put(storagePathFor(uid, docId), bytes, doc.type);
  await deps.store.updateDocument(uid, docId, { status: "uploaded" });
  return { status: 200, body: { ...doc, status: "uploaded" } };
}

export async function deleteUpload(
  uid: string,
  docId: string,
  deps: UploadDeps,
): Promise<UploadOutcome> {
  const doc = await deps.store.getDocument(uid, docId);
  if (!doc || doc.status === "deleted") return notFound();
  if (!OPEN_STATUSES.includes(doc.status)) {
    return conflict("document_processed", "This file was already processed and cannot be removed");
  }
  await deps.storage.delete(storagePathFor(uid, docId));
  await deps.store.updateDocument(uid, docId, { status: "deleted" });
  return { status: 204, body: null };
}

/** "signed" on Cloud Run, "proxy" when the Storage emulator is configured. */
export function uploadModeFromEnv(env: NodeJS.ProcessEnv = process.env): UploadMode {
  return env.FIREBASE_STORAGE_EMULATOR_HOST ? "proxy" : "signed";
}

function defaultDocumentId(): string {
  return `doc_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function notFound(): UploadOutcome {
  return { status: 404, body: { error: "not_found", message: "Upload not found" } };
}

function conflict(error: string, message: string): UploadOutcome {
  return { status: 409, body: { error, message } };
}

function bad(error: string, message: string): UploadOutcome {
  return { status: 400, body: { error, message } };
}
