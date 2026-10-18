import type { DocumentRecord, Holding, Loan, Transaction } from "@adidi/shared";
import type { JsonModel, JsonRequest } from "../gemini/client.js";
import type { ExtractedRecords, RecordsPort, StoragePort, StoredFile } from "./ports.js";

// In-memory versions of the ports and the model, for the stage tests and the accuracy script.

export class FakeStorage implements StoragePort {
  readonly files = new Map<string, StoredFile>();
  readonly deleted: string[] = [];

  constructor(initial: Record<string, StoredFile> = {}) {
    for (const [path, file] of Object.entries(initial)) this.files.set(path, file);
  }

  async download(path: string): Promise<StoredFile | null> {
    return this.files.get(path) ?? null;
  }

  async delete(path: string): Promise<void> {
    this.files.delete(path);
    this.deleted.push(path);
  }
}

export class FakeRecords implements RecordsPort {
  readonly documents = new Map<string, DocumentRecord>();
  readonly transactions = new Map<string, Transaction>();
  readonly loans = new Map<string, Loan>();
  readonly holdings = new Map<string, Holding>();
  readonly writes: ExtractedRecords[] = [];

  constructor(documents: DocumentRecord[] = []) {
    for (const doc of documents) this.documents.set(doc.id, doc);
  }

  async getDocument(_uid: string, documentId: string): Promise<DocumentRecord | null> {
    return this.documents.get(documentId) ?? null;
  }

  async updateDocument(
    _uid: string,
    documentId: string,
    patch: Partial<Pick<DocumentRecord, "status" | "reason">>,
  ): Promise<void> {
    const current = this.documents.get(documentId);
    if (!current) throw new Error(`no document ${documentId}`);
    this.documents.set(documentId, { ...current, ...patch });
  }

  async writeRecords(_uid: string, records: ExtractedRecords): Promise<void> {
    this.writes.push(records);
    for (const t of records.transactions) this.transactions.set(t.id, t);
    for (const l of records.loans) this.loans.set(l.id, l);
    for (const h of records.holdings) this.holdings.set(h.id, h);
  }

  async readRecordsForFile(_uid: string, documentId: string): Promise<ExtractedRecords> {
    const byFile = <T extends { sourceFileId: string }>(items: Iterable<T>) =>
      [...items].filter((item) => item.sourceFileId === documentId);
    return {
      transactions: byFile(this.transactions.values()),
      loans: byFile(this.loans.values()),
      holdings: byFile(this.holdings.values()),
    };
  }

  /** Everything stored, as plain JSON, for the "no unmasked numbers" scan. */
  stored(): unknown {
    return {
      documents: [...this.documents.values()],
      transactions: [...this.transactions.values()],
      loans: [...this.loans.values()],
      holdings: [...this.holdings.values()],
    };
  }
}

/** Answers each call from a queue, or with one fixed answer; records every request. */
export class FakeModel implements JsonModel {
  readonly requests: JsonRequest[] = [];
  private readonly answers: (unknown | Error)[];

  constructor(answers: (unknown | Error)[] | unknown) {
    this.answers = Array.isArray(answers) ? [...answers] : [answers];
  }

  async generateJson(request: JsonRequest): Promise<unknown> {
    this.requests.push(request);
    const next = this.answers.length > 1 ? this.answers.shift() : this.answers[0];
    if (next instanceof Error) throw next;
    return structuredClone(next);
  }
}
