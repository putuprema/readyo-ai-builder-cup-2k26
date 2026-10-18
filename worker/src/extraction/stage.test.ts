import { type DocumentRecord, hasLongDigitRun } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { ModelError } from "../gemini/client.js";
import { FakeModel, FakeRecords, FakeStorage } from "./fakes.js";
import { storagePathFor } from "./ports.js";
import { sampleStatement } from "./samples.js";
import { ExtractionStageError, runExtractionStage } from "./stage.js";

// specs/04-extraction.md task 2: storage, document status and file deletion around the
// extraction call, plus the unreadable-file decision.

const uid = "u1";

function document(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: "doc_bank_1",
    name: "bca-september.pdf",
    type: "application/pdf",
    size: 120_000,
    sourceKind: "bank",
    month: "2026-09",
    status: "uploaded",
    createdAt: "2026-10-01T08:00:00.000Z",
    ...overrides,
  };
}

function setup(documents: DocumentRecord[], answers: unknown) {
  const storage = new FakeStorage(
    Object.fromEntries(
      documents.map((doc) => [
        storagePathFor(uid, doc.id),
        { bytes: new Uint8Array([1, 2, 3]), contentType: doc.type },
      ]),
    ),
  );
  const records = new FakeRecords(documents);
  const model = new FakeModel(answers);
  const logs: string[] = [];
  return {
    storage,
    records,
    model,
    logs,
    deps: { storage, records, model, log: (m: string) => logs.push(m) },
  };
}

describe("runExtractionStage", () => {
  it("extracts, stores, marks the document extracted and deletes the file", async () => {
    const doc = document();
    const { deps, storage, records, model, logs } = setup([doc], sampleStatement);

    const result = await runExtractionStage({ uid, runKind: "first", documentIds: [doc.id] }, deps);

    expect(result.failed).toEqual([]);
    expect(result.extracted).toEqual([
      {
        documentId: doc.id,
        kind: "bank",
        name: doc.name,
        counts: { transactions: 3, loans: 0, holdings: 0 },
        warnings: expect.arrayContaining(["Last row has no readable date"]),
        reused: false,
        closingBalance: 9_830_000,
      },
    ]);
    expect(result.transactions).toHaveLength(3);
    expect(records.transactions.size).toBe(3);
    expect(records.documents.get(doc.id)?.status).toBe("extracted");
    expect(storage.deleted).toEqual([storagePathFor(uid, doc.id)]);
    expect(storage.files.size).toBe(0);
    expect(model.requests).toHaveLength(1);
    // Logs name the document and counts, never content.
    expect(logs.join("\n")).toContain("3 transactions");
    expect(logs.join("\n")).not.toContain("GAJI");
  });

  it("stores no unmasked account numbers", async () => {
    const doc = document();
    const { deps, records } = setup([doc], sampleStatement);
    await runExtractionStage({ uid, runKind: "first", documentIds: [doc.id] }, deps);
    expect(hasLongDigitRun(records.stored())).toBe(false);
  });

  it("marks an unreadable file failed with a reason, deletes it, and continues", async () => {
    const bank = document();
    const wallet = document({
      id: "doc_wallet_1",
      name: "gopay.png",
      type: "image/png",
      sourceKind: "ewallet",
    });
    const { deps, storage, records } = setup(
      [bank, wallet],
      [sampleStatement, new ModelError("empty_response", "nothing")],
    );

    const result = await runExtractionStage(
      { uid, runKind: "first", documentIds: [bank.id, wallet.id] },
      deps,
    );

    expect(result.extracted.map((s) => s.documentId)).toEqual([bank.id]);
    expect(result.failed).toEqual([
      {
        documentId: wallet.id,
        kind: "ewallet",
        name: "gopay.png",
        reason: "The model could not read anything from the document",
      },
    ]);
    expect(records.documents.get(wallet.id)).toMatchObject({
      status: "failed",
      reason: "The model could not read anything from the document",
    });
    expect(storage.deleted.sort()).toEqual(
      [storagePathFor(uid, bank.id), storagePathFor(uid, wallet.id)].sort(),
    );
  });

  it("fails the run when nothing could be read", async () => {
    const doc = document();
    const { deps } = setup([doc], new ModelError("blocked", "SAFETY"));
    const run = runExtractionStage({ uid, runKind: "first", documentIds: [doc.id] }, deps);
    await expect(run).rejects.toThrow(ExtractionStageError);
    await expect(run).rejects.toThrow(/could not read bca-september\.pdf/);
  });

  it("fails a first run when the bank statement failed but another file was read", async () => {
    const bank = document();
    const wallet = document({ id: "doc_wallet_1", name: "gopay.png", sourceKind: "ewallet" });
    const { deps } = setup(
      [bank, wallet],
      [new ModelError("empty_response", "x"), sampleStatement],
    );
    const run = runExtractionStage(
      { uid, runKind: "first", documentIds: [bank.id, wallet.id] },
      deps,
    );
    await expect(run).rejects.toThrow(/could not read your bank statement/);
  });

  it("continues a monthly run without the bank statement", async () => {
    const bank = document();
    const wallet = document({ id: "doc_wallet_1", name: "gopay.png", sourceKind: "ewallet" });
    const { deps } = setup(
      [bank, wallet],
      [new ModelError("empty_response", "x"), sampleStatement],
    );
    const result = await runExtractionStage(
      { uid, runKind: "monthly", documentIds: [bank.id, wallet.id] },
      deps,
    );
    expect(result.failed.map((f) => f.documentId)).toEqual([bank.id]);
    expect(result.extracted.map((s) => s.documentId)).toEqual([wallet.id]);
  });

  it("reports a missing file or record as failed without calling the model", async () => {
    const doc = document();
    const { deps, storage, model, records } = setup([doc], sampleStatement);
    storage.files.clear();
    const run = runExtractionStage({ uid, runKind: "first", documentIds: [doc.id, "ghost"] }, deps);
    await expect(run).rejects.toThrow(ExtractionStageError);
    expect(model.requests).toHaveLength(0);
    expect(records.documents.get(doc.id)).toMatchObject({
      status: "failed",
      reason: "The uploaded file was not found",
    });
  });

  it("reuses stored records on a retry instead of calling the model again", async () => {
    const doc = document();
    const { deps, model, records } = setup([doc], sampleStatement);
    const first = await runExtractionStage({ uid, runKind: "first", documentIds: [doc.id] }, deps);
    const second = await runExtractionStage({ uid, runKind: "first", documentIds: [doc.id] }, deps);

    expect(model.requests).toHaveLength(1);
    expect(second.extracted[0]?.reused).toBe(true);
    expect(second.transactions.map((t) => t.id).sort()).toEqual(
      first.transactions.map((t) => t.id).sort(),
    );
    expect(records.transactions.size).toBe(3);
  });

  it("does not fail the run when deleting the file fails", async () => {
    const doc = document();
    const { deps, storage, logs } = setup([doc], sampleStatement);
    storage.delete = async () => {
      throw new Error("bucket unavailable");
    };
    const result = await runExtractionStage({ uid, runKind: "first", documentIds: [doc.id] }, deps);
    expect(result.extracted).toHaveLength(1);
    expect(logs.join("\n")).toContain("could not delete the file: bucket unavailable");
  });
});
