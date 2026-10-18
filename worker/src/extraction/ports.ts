import type { DocumentRecord, Holding, Loan, Transaction } from "@adidi/shared";

// What the extraction stage needs from the outside world, as two small interfaces so the stage
// is unit-tested with in-memory fakes. `../infra/` has the Cloud Storage and Firestore versions.

export interface StoredFile {
  bytes: Uint8Array;
  contentType?: string;
}

export interface StoragePort {
  /** Returns null when the object does not exist. */
  download(path: string): Promise<StoredFile | null>;
  /** Deleting a missing object is not an error. */
  delete(path: string): Promise<void>;
}

export interface ExtractedRecords {
  transactions: Transaction[];
  loans: Loan[];
  holdings: Holding[];
}

export interface RecordsPort {
  getDocument(uid: string, documentId: string): Promise<DocumentRecord | null>;
  updateDocument(
    uid: string,
    documentId: string,
    patch: Partial<Pick<DocumentRecord, "status" | "reason" | "closingBalance">>,
  ): Promise<void>;
  /** Idempotent: records are written by id, so writing the same batch twice changes nothing. */
  writeRecords(uid: string, records: ExtractedRecords): Promise<void>;
  /** Everything previously written for one file (a retry reuses it instead of calling the model). */
  readRecordsForFile(uid: string, documentId: string): Promise<ExtractedRecords>;
  /** Stored transactions of the months before `month` (recurring detection, spec 07). */
  listTransactionsBefore(uid: string, month: string): Promise<Transaction[]>;
  /** Removes the duplicates normalization dropped, so the stored rows match the snapshot. */
  deleteTransactions(uid: string, ids: string[]): Promise<void>;
}

/** Cloud Storage object path for an upload: the same path as its Firestore record (spec 01). */
export function storagePathFor(uid: string, documentId: string): string {
  return `users/${uid}/documents/${documentId}`;
}
