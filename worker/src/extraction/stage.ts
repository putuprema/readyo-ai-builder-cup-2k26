import type {
  DocumentRecord,
  Holding,
  Loan,
  RunKind,
  SourceKind,
  Transaction,
} from "@adidi/shared";
import type { JsonModel } from "../gemini/client.js";
import { ExtractionError, type ExtractionResult, extractDocument } from "./extract.js";
import { type RecordsPort, type StoragePort, storagePathFor } from "./ports.js";

// The "reading" stage of a run: extract every submitted document, store the records, delete the
// files, and report which sources could not be read. Decision recorded in specs/04-extraction.md:
// continue with the readable files and flag the rest; fail only when nothing was readable, or when
// the bank statement failed on a first run.

export interface ExtractionStageInput {
  uid: string;
  runKind: RunKind;
  documentIds: string[];
}

export interface ExtractionStageDeps {
  storage: StoragePort;
  records: RecordsPort;
  model: JsonModel;
  /** Receives one short line per event. Never given file or model content. */
  log?: (message: string) => void;
}

export interface ExtractedSource {
  documentId: string;
  kind: SourceKind;
  name: string;
  counts: { transactions: number; loans: number; holdings: number };
  warnings: string[];
  /** True when a retry found the records already stored and skipped the model call. */
  reused: boolean;
  /** Bank and e-wallet statements: the closing balance, for the snapshot's bankBalances. */
  closingBalance: number | null;
}

export interface FailedSource {
  documentId: string;
  kind: SourceKind;
  name: string;
  reason: string;
}

export interface ExtractionStageResult {
  extracted: ExtractedSource[];
  failed: FailedSource[];
  transactions: Transaction[];
  loans: Loan[];
  holdings: Holding[];
}

/** Thrown when the run cannot continue; `message` is shown to the user (RunStatus.error). */
export class ExtractionStageError extends Error {
  constructor(
    message: string,
    readonly failed: FailedSource[],
  ) {
    super(message);
    this.name = "ExtractionStageError";
  }
}

export async function runExtractionStage(
  input: ExtractionStageInput,
  deps: ExtractionStageDeps,
): Promise<ExtractionStageResult> {
  const log = deps.log ?? (() => {});
  const result: ExtractionStageResult = {
    extracted: [],
    failed: [],
    transactions: [],
    loans: [],
    holdings: [],
  };

  for (const documentId of input.documentIds) {
    const document = await deps.records.getDocument(input.uid, documentId);
    if (!document) {
      log(`document ${documentId}: no record, skipped`);
      result.failed.push({
        documentId,
        kind: "bank",
        name: documentId,
        reason: "The upload record was not found",
      });
      continue;
    }
    const outcome = await extractOne(input.uid, document, deps, log);
    if ("reason" in outcome) {
      result.failed.push(outcome);
    } else {
      result.extracted.push(outcome.source);
      result.transactions.push(...outcome.records.transactions);
      result.loans.push(...outcome.records.loans);
      result.holdings.push(...outcome.records.holdings);
    }
  }

  const stop = stopReason(input.runKind, result);
  if (stop) throw new ExtractionStageError(stop, result.failed);
  return result;
}

type OneOutcome =
  | {
      source: ExtractedSource;
      records: Pick<ExtractionResult, "transactions" | "loans" | "holdings">;
    }
  | FailedSource;

async function extractOne(
  uid: string,
  document: DocumentRecord,
  deps: ExtractionStageDeps,
  log: (message: string) => void,
): Promise<OneOutcome> {
  const tag = `document ${document.id} (${document.sourceKind})`;
  const path = storagePathFor(uid, document.id);

  // Idempotency: a retried task finds the document already extracted and reuses its records.
  if (document.status === "extracted") {
    const records = await deps.records.readRecordsForFile(uid, document.id);
    log(`${tag}: already extracted, reusing ${describeCounts(records)}`);
    return {
      source: {
        documentId: document.id,
        kind: document.sourceKind,
        name: document.name,
        counts: counts(records),
        warnings: [],
        reused: true,
        closingBalance: document.closingBalance ?? null,
      },
      records,
    };
  }

  const file = await deps.storage.download(path);
  if (!file) {
    return await fail(uid, document, "The uploaded file was not found", deps, log);
  }

  const started = Date.now();
  let extraction: ExtractionResult;
  try {
    extraction = await extractDocument(
      { document, file: { bytes: file.bytes, mimeType: file.contentType ?? document.type } },
      deps.model,
    );
  } catch (error) {
    const reason =
      error instanceof ExtractionError ? error.reason : "The document could not be read";
    const outcome = await fail(uid, document, reason, deps, log);
    await deleteQuietly(deps.storage, path, tag, log);
    return outcome;
  }

  await deps.records.writeRecords(uid, extraction);
  await deps.records.updateDocument(uid, document.id, {
    status: "extracted",
    closingBalance: extraction.meta.closingBalance,
  });
  log(`${tag}: extracted ${describeCounts(extraction)} in ${Date.now() - started} ms`);
  await deleteQuietly(deps.storage, path, tag, log);

  return {
    source: {
      documentId: document.id,
      kind: document.sourceKind,
      name: document.name,
      counts: counts(extraction),
      warnings: extraction.warnings,
      reused: false,
      closingBalance: extraction.meta.closingBalance,
    },
    records: extraction,
  };
}

async function fail(
  uid: string,
  document: DocumentRecord,
  reason: string,
  deps: ExtractionStageDeps,
  log: (message: string) => void,
): Promise<FailedSource> {
  await deps.records.updateDocument(uid, document.id, { status: "failed", reason });
  log(`document ${document.id} (${document.sourceKind}): failed: ${reason}`);
  return { documentId: document.id, kind: document.sourceKind, name: document.name, reason };
}

// The raw file goes whether extraction succeeded or failed: a failed source needs a fresh
// upload, and nothing keeps statements longer than one run. A failed delete is logged, not
// fatal: the bucket's lifecycle rule is the safety net.
async function deleteQuietly(
  storage: StoragePort,
  path: string,
  tag: string,
  log: (message: string) => void,
): Promise<void> {
  try {
    await storage.delete(path);
  } catch (error) {
    log(`${tag}: could not delete the file: ${error instanceof Error ? error.message : "error"}`);
  }
}

function counts(records: Pick<ExtractionResult, "transactions" | "loans" | "holdings">) {
  return {
    transactions: records.transactions.length,
    loans: records.loans.length,
    holdings: records.holdings.length,
  };
}

function describeCounts(records: Pick<ExtractionResult, "transactions" | "loans" | "holdings">) {
  const c = counts(records);
  return `${c.transactions} transactions, ${c.loans} loans, ${c.holdings} holdings`;
}

export function stopReason(runKind: RunKind, result: ExtractionStageResult): string | null {
  if (result.extracted.length === 0) {
    return result.failed.length === 1
      ? `We could not read ${result.failed[0]?.name}. ${result.failed[0]?.reason}.`
      : "We could not read any of the uploaded files. Try clearer screenshots or the PDF export from your bank's app.";
  }
  if (runKind === "first") {
    const bank = result.failed.find((f) => f.kind === "bank");
    const bankRead = result.extracted.some((s) => s.kind === "bank");
    if (bank && !bankRead) {
      return `We could not read your bank statement (${bank.name}). ${bank.reason}. The analysis needs it to see your income.`;
    }
  }
  return null;
}
