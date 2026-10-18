import {
  type DocumentRecord,
  effectiveAnnualRate,
  type Holding,
  type LiquidityClass,
  type Loan,
  type LoanType,
  maskAccountNumber,
  maskDigitRuns,
  type SourceKind,
  type Transaction,
} from "@adidi/shared";
import type { ZodError } from "zod";
import type { FilePart, JsonModel } from "../gemini/client.js";
import { ModelError } from "../gemini/client.js";
import assumptions from "./assumptions.json" with { type: "json" };
import { recordId } from "./ids.js";
import { EXTRACTION_SYSTEM_INSTRUCTION, extractionPrompt } from "./prompt.js";
import {
  type ExtractedLoanBill,
  type ExtractedPortfolio,
  type ExtractedStatement,
  type InstrumentType,
  responseJsonSchemaFor,
  schemaFamilyOf,
  schemaFor,
} from "./schemas.js";

// Stage 2 for one file: ask Gemini for the structured reading, validate it, then turn it into
// the shared records with masking, deterministic ids and code-computed figures. Nothing here
// touches storage or Firestore; `stage.ts` does that.

export interface ExtractionInput {
  document: DocumentRecord;
  file: FilePart;
}

export interface ExtractionMeta {
  institution: string;
  /** Masked account label, e.g. "BCA ****7890" or "GoPay ****4567". */
  sourceAccount: string;
  periodStart: string | null;
  periodEnd: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  asOfDate: string | null;
  totalValue: number | null;
}

export interface ExtractionResult {
  documentId: string;
  kind: SourceKind;
  transactions: Transaction[];
  loans: Loan[];
  holdings: Holding[];
  warnings: string[];
  meta: ExtractionMeta;
}

export class ExtractionError extends Error {
  constructor(
    readonly reason: string,
    readonly cause?: unknown,
  ) {
    super(reason);
    this.name = "ExtractionError";
  }
}

export async function extractDocument(
  input: ExtractionInput,
  model: JsonModel,
): Promise<ExtractionResult> {
  const { document } = input;
  const kind = document.sourceKind;
  let raw: unknown;
  try {
    raw = await model.generateJson({
      tier: "pro",
      systemInstruction: EXTRACTION_SYSTEM_INSTRUCTION,
      files: [input.file],
      prompt: extractionPrompt(kind),
      responseJsonSchema: responseJsonSchemaFor(kind),
    });
  } catch (error) {
    if (error instanceof ModelError) throw new ExtractionError(reasonFor(error), error);
    throw new ExtractionError("The document could not be read", error);
  }
  const parsed = schemaFor(kind).safeParse(raw);
  if (!parsed.success) {
    throw new ExtractionError(
      `The model's answer did not match the expected format (${summarizeIssues(parsed.error)})`,
      parsed.error,
    );
  }
  return mapExtraction(document, parsed.data);
}

function reasonFor(error: ModelError): string {
  switch (error.code) {
    case "blocked":
      return "The document was rejected by the model's safety filters";
    case "empty_response":
      return "The model could not read anything from the document";
    case "invalid_json":
      return "The model's answer was not valid JSON";
    default:
      return error.message;
  }
}

function summarizeIssues(error: ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
}

/** Pure mapping from a validated model answer to the shared records. Exported for tests. */
export function mapExtraction(
  document: DocumentRecord,
  data: ExtractedStatement | ExtractedLoanBill | ExtractedPortfolio,
): ExtractionResult {
  const family = schemaFamilyOf[document.sourceKind];
  switch (family) {
    case "statement":
      return mapStatement(document, data as ExtractedStatement);
    case "loanBill":
      return mapLoanBill(document, data as ExtractedLoanBill);
    case "portfolio":
      return mapPortfolio(document, data as ExtractedPortfolio);
  }
}

function emptyMeta(): ExtractionMeta {
  return {
    institution: "",
    sourceAccount: "",
    periodStart: null,
    periodEnd: null,
    openingBalance: null,
    closingBalance: null,
    asOfDate: null,
    totalValue: null,
  };
}

function accountLabel(institution: string, accountNumber: string | null): string {
  const masked = maskAccountNumber(accountNumber);
  const name = institution.trim();
  return masked ? `${name} ${masked}`.trim() : name;
}

// ---- bank and e-wallet ----

function mapStatement(document: DocumentRecord, data: ExtractedStatement): ExtractionResult {
  const warnings = [...data.warnings];
  const sourceAccount = accountLabel(data.institution, data.accountNumber);
  const fallbackDate = data.periodEnd ?? `${document.month}-01`;
  let undated = 0;

  const transactions: Transaction[] = data.transactions.map((row, index) => {
    let date = row.date;
    if (!date) {
      undated += 1;
      date = fallbackDate;
    }
    const rawDescription = maskDigitRuns(row.description.trim());
    const counterparty = maskDigitRuns(row.counterparty.trim());
    const transaction: Transaction = {
      id: recordId("txn", document.id, index, date, row.amount, row.direction, rawDescription),
      month: document.month,
      date,
      amount: Math.abs(Math.round(row.amount)),
      direction: row.direction,
      counterparty,
      rawDescription,
      sourceAccount,
      sourceFileId: document.id,
    };
    // The model only says whether the printed counterparty is the holder; the name itself is
    // never stored. Code turns that fact into the class.
    if (row.counterpartyIsAccountHolder) {
      transaction.cls = "own_transfer";
      transaction.category = "own_transfer";
    }
    return transaction;
  });

  if (undated > 0) {
    warnings.push(`${undated} row(s) had no readable date and were dated ${fallbackDate}`);
  }

  return {
    documentId: document.id,
    kind: document.sourceKind,
    transactions,
    loans: [],
    holdings: [],
    warnings,
    meta: {
      ...emptyMeta(),
      institution: data.institution,
      sourceAccount,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      openingBalance: data.openingBalance,
      closingBalance: data.closingBalance,
    },
  };
}

// ---- PayLater and pinjol ----

const loanTypeOf: Partial<Record<SourceKind, LoanType>> = {
  paylater: "paylater",
  pinjol: "pinjol",
};

function mapLoanBill(document: DocumentRecord, data: ExtractedLoanBill): ExtractionResult {
  const warnings = [...data.warnings];
  const type: LoanType = loanTypeOf[document.sourceKind] ?? "other";

  const outstandingPrincipal = data.outstandingPrincipal ?? data.totalOutstanding ?? 0;
  if (data.outstandingPrincipal === null) {
    warnings.push(
      data.totalOutstanding === null
        ? "Outstanding amount not readable; recorded as 0"
        : "Outstanding principal not shown; the total outstanding was used instead",
    );
  }
  const monthlyInstallment = data.monthlyInstallment ?? 0;
  if (data.monthlyInstallment === null)
    warnings.push("Monthly instalment not readable; recorded as 0");

  const remainingTenorMonths = data.remainingTenorMonths ?? assumptions.unknownRemainingTenorMonths;
  if (data.remainingTenorMonths === null) {
    warnings.push(`Remaining tenor not shown; assumed ${remainingTenorMonths} month(s)`);
  }

  let rate = effectiveAnnualRate(data.fee, {
    outstandingPrincipal,
    monthlyInstallment,
    remainingTenorMonths: data.remainingTenorMonths,
    totalTenorMonths: data.totalTenorMonths,
  });
  if (rate === null) {
    rate = assumptions.unknownFeeAnnualRate[type];
    warnings.push(
      `No fee information on the bill; assumed ${Math.round(rate * 100)}% a year for ${type}`,
    );
  }

  const loan: Loan = {
    id: recordId("loan", document.id),
    month: document.month,
    lender: maskDigitRuns(data.lender.trim()),
    type,
    outstandingPrincipal: Math.max(0, Math.round(outstandingPrincipal)),
    monthlyInstallment: Math.max(0, Math.round(monthlyInstallment)),
    effectiveAnnualRate: rate,
    remainingTenorMonths,
    sourceFileId: document.id,
  };

  return {
    documentId: document.id,
    kind: document.sourceKind,
    transactions: [],
    loans: [loan],
    holdings: [],
    warnings,
    meta: {
      ...emptyMeta(),
      institution: data.lender,
      sourceAccount: accountLabel(data.lender, data.accountNumber),
    },
  };
}

// ---- investment ----

// Liquidity and volatility by instrument type (specs/04-extraction.md: "crypto and stocks
// volatile; money-market and deposits not"). Bonds and deposits held to a maturity date are
// locked until then.
const instrumentProfile: Record<InstrumentType, { liquidity: LiquidityClass; volatile: boolean }> =
  {
    cash: { liquidity: "cash", volatile: false },
    money_market_fund: { liquidity: "liquid", volatile: false },
    fixed_income_fund: { liquidity: "liquid", volatile: false },
    mixed_fund: { liquidity: "liquid", volatile: true },
    equity_fund: { liquidity: "liquid", volatile: true },
    stock: { liquidity: "liquid", volatile: true },
    bond: { liquidity: "liquid", volatile: false },
    deposit: { liquidity: "locked", volatile: false },
    gold: { liquidity: "liquid", volatile: true },
    crypto: { liquidity: "liquid", volatile: true },
    other: { liquidity: "liquid", volatile: true },
  };

export function classifyHolding(
  instrumentType: InstrumentType,
  lockedUntil: string | null,
  month: string,
): { liquidityClass: LiquidityClass; volatile: boolean } {
  const profile = instrumentProfile[instrumentType];
  // A lock-up that ends after the analysis month makes the holding locked whatever its type.
  const locked = lockedUntil !== null && lockedUntil.slice(0, 7) > month;
  return {
    liquidityClass: locked ? "locked" : profile.liquidity,
    volatile: profile.volatile,
  };
}

function mapPortfolio(document: DocumentRecord, data: ExtractedPortfolio): ExtractionResult {
  const warnings = [...data.warnings];
  const provider = maskDigitRuns(data.provider.trim());
  const missingRates = new Set<string>();
  const holdings: Holding[] = data.holdings.map((row, index) => {
    const instrument = maskDigitRuns(row.instrument.trim());
    const converted = toRupiah(row.currentValue, row.currency);
    if (converted === null) missingRates.add(row.currency);
    const holding: Holding = {
      id: recordId("hold", document.id, index, instrument),
      month: document.month,
      instrument,
      provider,
      currentValue: Math.max(0, converted ?? 0),
      ...classifyHolding(row.instrumentType, row.lockedUntil, document.month),
      sourceFileId: document.id,
    };
    if (!isRupiah(row.currency)) {
      holding.currency = row.currency.toUpperCase();
      holding.nativeValue = row.currentValue;
    }
    return holding;
  });
  for (const currency of missingRates) {
    warnings.push(`No exchange rate for ${currency}; holdings in it were recorded as Rp 0`);
  }
  if (holdings.some((h) => h.currency)) {
    const used = [...new Set(holdings.map((h) => h.currency).filter(Boolean))].join(", ");
    warnings.push(`Values in ${used} were converted with the assumed exchange rate`);
  }

  const sum = data.holdings.reduce((acc, h) => acc + h.currentValue, 0);
  if (data.totalValue !== null && Math.abs(sum - data.totalValue) > Math.max(1, sum * 0.01)) {
    warnings.push("Holdings do not add up to the printed total value");
  }

  return {
    documentId: document.id,
    kind: document.sourceKind,
    transactions: [],
    loans: [],
    holdings,
    warnings,
    meta: {
      ...emptyMeta(),
      institution: data.provider,
      sourceAccount: accountLabel(data.provider, data.accountNumber),
      asOfDate: data.asOfDate,
      totalValue: toRupiah(data.totalValue, data.currency),
    },
  };
}

function isRupiah(currency: string): boolean {
  const code = currency.trim().toUpperCase();
  return code === "" || code === "IDR" || code === "RP";
}

/** Integer rupiah for a printed value, via the FX assumption; null when no rate is known. */
export function toRupiah(value: number | null, currency: string): number | null {
  if (value === null) return null;
  if (isRupiah(currency)) return Math.round(value);
  const rate = (assumptions.fxRates as Record<string, { idrPerUnit: number } | undefined>)[
    currency.trim().toUpperCase()
  ];
  return rate ? Math.round(value * rate.idrPerUnit) : null;
}
