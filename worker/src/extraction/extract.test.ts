import { type DocumentRecord, hasLongDigitRun } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { ModelError } from "../gemini/client.js";
import { ExtractionError, extractDocument, mapExtraction } from "./extract.js";
import { FakeModel } from "./fakes.js";
import { sampleStatement } from "./samples.js";

// specs/04-extraction.md task 2: extraction call, masking and the mapping onto the shared types
// for a bank statement, with the model faked.

const bankDocument: DocumentRecord = {
  id: "doc_bank_1",
  name: "bca-september.pdf",
  type: "application/pdf",
  size: 120_000,
  sourceKind: "bank",
  month: "2026-09",
  status: "uploaded",
  createdAt: "2026-10-01T08:00:00.000Z",
};

const file = { bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]), mimeType: "application/pdf" };

describe("extractDocument for a bank statement", () => {
  it("sends the file to the Pro tier with the bank schema and prompt", async () => {
    const model = new FakeModel(sampleStatement);
    await extractDocument({ document: bankDocument, file }, model);
    const request = model.requests[0];
    expect(request?.tier).toBe("pro");
    expect(request?.files).toEqual([file]);
    expect(request?.prompt).toContain("Extract every transaction");
    expect(request?.systemInstruction).toContain("Rp 1.250.000");
    expect(request?.responseJsonSchema.type).toBe("object");
  });

  it("maps rows onto Transaction with masked account and description", async () => {
    const result = await extractDocument(
      { document: bankDocument, file },
      new FakeModel(sampleStatement),
    );
    expect(result.kind).toBe("bank");
    expect(result.transactions).toHaveLength(3);
    expect(result.loans).toEqual([]);
    expect(result.holdings).toEqual([]);

    const salary = result.transactions[0];
    expect(salary).toMatchObject({
      month: "2026-09",
      date: "2026-09-01",
      amount: 15_000_000,
      direction: "in",
      counterparty: "PT MAJU JAYA",
      sourceAccount: "BCA ****7890",
      sourceFileId: "doc_bank_1",
    });
    expect(salary?.rawDescription).toBe(
      "TRSF E-BANKING CR 0109/FTSCY/WS95051 GAJI SEPT PT MAJU JAYA",
    );

    const topup = result.transactions[1];
    expect(topup?.rawDescription).toBe("TRSF E-BANKING DB TOPUP GOPAY ****7890");
    expect(hasLongDigitRun(result)).toBe(false);
  });

  it("dates unreadable rows at the period end and says so in warnings", async () => {
    const result = await extractDocument(
      { document: bankDocument, file },
      new FakeModel(sampleStatement),
    );
    expect(result.transactions[2]?.date).toBe("2026-09-30");
    expect(result.warnings).toContain("1 row(s) had no readable date and were dated 2026-09-30");
    expect(result.warnings).toContain("Last row has no readable date");
  });

  it("falls back to the first of the month without a statement period", () => {
    const result = mapExtraction(bankDocument, { ...sampleStatement, periodEnd: null });
    expect(result.transactions[2]?.date).toBe("2026-09-01");
  });

  it("gives the same ids on a second extraction and distinct ids to identical rows", async () => {
    const twice = { ...sampleStatement, transactions: [...sampleStatement.transactions] };
    const topup = sampleStatement.transactions[1];
    if (!topup) throw new Error("sample needs a second row");
    twice.transactions.push({ ...topup });
    const a = mapExtraction(bankDocument, twice);
    const b = mapExtraction(bankDocument, twice);
    expect(a.transactions.map((t) => t.id)).toEqual(b.transactions.map((t) => t.id));
    expect(new Set(a.transactions.map((t) => t.id)).size).toBe(4);
    expect(a.transactions[0]?.id).toMatch(/^txn_[0-9a-f]{20}$/);
  });

  it("keeps the meta the later stages and the accuracy script need", async () => {
    const result = await extractDocument(
      { document: bankDocument, file },
      new FakeModel(sampleStatement),
    );
    expect(result.meta).toMatchObject({
      institution: "BCA",
      sourceAccount: "BCA ****7890",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      openingBalance: 12_500_000,
      closingBalance: 9_830_000,
    });
  });

  it("turns a model answer that misses the schema into an ExtractionError", async () => {
    const bad = { ...sampleStatement, transactions: [{ date: "2026-09-01", amount: "1.250.000" }] };
    await expect(
      extractDocument({ document: bankDocument, file }, new FakeModel(bad)),
    ).rejects.toThrow(ExtractionError);
    await expect(
      extractDocument({ document: bankDocument, file }, new FakeModel(bad)),
    ).rejects.toMatchObject({
      reason: expect.stringContaining("did not match the expected format"),
    });
  });

  it("maps model failures to reasons safe to store", async () => {
    const blocked = new FakeModel(new ModelError("blocked", "Request blocked: SAFETY"));
    await expect(extractDocument({ document: bankDocument, file }, blocked)).rejects.toMatchObject({
      reason: "The document was rejected by the model's safety filters",
    });
    const empty = new FakeModel(new ModelError("empty_response", "no content"));
    await expect(extractDocument({ document: bankDocument, file }, empty)).rejects.toMatchObject({
      reason: "The model could not read anything from the document",
    });
    const unknown = new FakeModel(new Error("socket hang up"));
    await expect(extractDocument({ document: bankDocument, file }, unknown)).rejects.toMatchObject({
      reason: "The document could not be read",
    });
  });
});
