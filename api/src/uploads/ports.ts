import type { DocumentRecord } from "@adidi/shared";

// What the upload endpoints need from Firestore and Cloud Storage, as two small interfaces
// so the handlers are unit-tested with `./fakes.ts`. `../infra/firestore.ts` and
// `../infra/storage.ts` have the firebase-admin versions.

export interface UploadStore {
  createDocument(uid: string, doc: DocumentRecord): Promise<void>;
  /** The user's upload record, or null (another user's record is null too). */
  getDocument(uid: string, documentId: string): Promise<DocumentRecord | null>;
  updateDocument(uid: string, documentId: string, patch: Partial<DocumentRecord>): Promise<void>;
}

export interface UploadStorage {
  /**
   * A URL the browser can PUT the file to directly, valid until `expires` and bound to the
   * content type (Cloud Storage V4 signed URL).
   */
  signedUploadUrl(path: string, contentType: string, expires: Date): Promise<string>;
  /** Writes the bytes at the path (the emulator-only proxy route). */
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Deletes the file; a missing file is not an error. */
  delete(path: string): Promise<void>;
}

/** Where a document's file lives in the default bucket (specs/01-contracts.md). */
export function storagePathFor(uid: string, documentId: string): string {
  return `users/${uid}/documents/${documentId}`;
}
