import type { DocumentRecord } from "@adidi/shared";
import type { UploadStorage, UploadStore } from "./ports.js";

// In-memory versions of the upload store and the bucket for the upload endpoint tests.

export class FakeUploadStore implements UploadStore {
  readonly documents = new Map<string, DocumentRecord>(); // key: `${uid}/${documentId}`

  addDocument(uid: string, doc: DocumentRecord): this {
    this.documents.set(`${uid}/${doc.id}`, doc);
    return this;
  }

  async createDocument(uid: string, doc: DocumentRecord): Promise<void> {
    if (this.documents.has(`${uid}/${doc.id}`)) throw new Error(`document ${doc.id} exists`);
    this.documents.set(`${uid}/${doc.id}`, doc);
  }

  async getDocument(uid: string, documentId: string): Promise<DocumentRecord | null> {
    return this.documents.get(`${uid}/${documentId}`) ?? null;
  }

  async updateDocument(uid: string, documentId: string, patch: Partial<DocumentRecord>) {
    const doc = this.documents.get(`${uid}/${documentId}`);
    if (!doc) throw new Error(`no document ${documentId}`);
    this.documents.set(`${uid}/${documentId}`, { ...doc, ...patch });
  }
}

export class FakeUploadStorage implements UploadStorage {
  readonly files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  readonly signed: { path: string; contentType: string; expires: Date }[] = [];
  readonly deleted: string[] = [];

  async signedUploadUrl(path: string, contentType: string, expires: Date): Promise<string> {
    this.signed.push({ path, contentType, expires });
    return `https://storage.example/${path}?signature=fake`;
  }

  async put(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.files.set(path, { bytes, contentType });
  }

  async delete(path: string): Promise<void> {
    this.files.delete(path);
    this.deleted.push(path);
  }
}
