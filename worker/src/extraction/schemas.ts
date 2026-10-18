import type { SourceKind } from "@adidi/shared";
import { z } from "zod";

// Response schemas for stage 2 (specs/04-extraction.md, task 1). One schema per document
// family; Gemini is asked to return exactly this shape with structured output, so nothing
// downstream parses free text. These are the model's raw output: code then masks account
// numbers, assigns ids, computes effective rates and maps them onto the shared types.
//
// Conventions stated to the model in the prompt and enforced here: amounts are integers in
// rupiah, dates are "YYYY-MM-DD", unreadable fields are null, rows are never invented.

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Date as YYYY-MM-DD");

const rupiah = z.number().int().describe("Integer amount in rupiah, no decimals, no separators");

const nullableRupiah = rupiah.nullable();

const warnings = z
  .array(z.string())
  .describe("Anything that made the document hard to read: cut-off pages, blur, missing columns");

// ---- bank and e-wallet statements ----

export const extractedTransactionSchema = z.object({
  date: isoDate.nullable().describe("Transaction date, null if unreadable"),
  amount: rupiah.describe("Absolute amount of this row in rupiah"),
  direction: z.enum(["in", "out"]).describe("in = credit (CR), out = debit (DB)"),
  counterparty: z
    .string()
    .describe("Merchant, person or institution on the other side, as printed; empty if none"),
  description: z.string().describe("The row's description text exactly as printed"),
  balanceAfter: nullableRupiah.describe("Running balance after this row, null if not shown"),
  counterpartyIsAccountHolder: z
    .boolean()
    .describe(
      "true when the counterparty printed on this row is the account holder named in the statement header (a transfer between the holder's own accounts)",
    ),
});

export const extractedStatementSchema = z.object({
  institution: z.string().describe("Bank or e-wallet name, e.g. BCA, GoPay"),
  accountLabel: z.string().nullable().describe("Product or account name as printed, if any"),
  accountNumber: z
    .string()
    .nullable()
    .describe("Account or wallet number as printed, digits only; null if not shown"),
  periodStart: isoDate.nullable().describe("First day of the statement period"),
  periodEnd: isoDate.nullable().describe("Last day of the statement period"),
  openingBalance: nullableRupiah,
  closingBalance: nullableRupiah,
  transactions: z.array(extractedTransactionSchema),
  warnings,
});

// ---- PayLater and pinjol bills ----

export const feeKinds = [
  "monthly_rate",
  "annual_rate",
  "flat_monthly_fee",
  "total_fee",
  "none",
  "unknown",
] as const;

export const extractedLoanBillSchema = z.object({
  lender: z.string().describe("Lender or product owner, e.g. SPayLater, Kredivo, GoPayLater"),
  productName: z.string().nullable().describe("Product or plan name as printed"),
  accountNumber: z
    .string()
    .nullable()
    .describe("Account, contract or virtual account number as printed; null if not shown"),
  billMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable()
    .describe("Billing month as YYYY-MM"),
  outstandingPrincipal: nullableRupiah.describe(
    "Principal still owed across all active instalments, excluding fees and interest",
  ),
  totalOutstanding: nullableRupiah.describe("Total still owed including fees and interest"),
  monthlyInstallment: nullableRupiah.describe("Amount due this month"),
  dueDate: isoDate.nullable(),
  remainingTenorMonths: z
    .number()
    .int()
    .nullable()
    .describe("Months of instalments left, including this one"),
  totalTenorMonths: z.number().int().nullable(),
  fee: z.object({
    kind: z
      .enum(feeKinds)
      .describe(
        "monthly_rate: percentage per month; annual_rate: percentage per year; flat_monthly_fee: fixed rupiah fee per month; total_fee: fixed rupiah fee over the whole tenor; none: no fee shown as zero; unknown: no fee information",
      ),
    value: z
      .number()
      .nullable()
      .describe("Rate as a fraction (2.95% -> 0.0295) or fee in rupiah, per kind; null if unknown"),
  }),
  lateFee: nullableRupiah.describe("Late fee charged this month, if any"),
  warnings,
});

// ---- investment portfolios ----

export const instrumentTypes = [
  "cash",
  "money_market_fund",
  "fixed_income_fund",
  "mixed_fund",
  "equity_fund",
  "stock",
  "bond",
  "deposit",
  "gold",
  "crypto",
  "other",
] as const;

export type InstrumentType = (typeof instrumentTypes)[number];

export const extractedHoldingSchema = z.object({
  instrument: z.string().describe("Fund, ticker, coin or product name as printed"),
  instrumentType: z.enum(instrumentTypes),
  currency: z
    .string()
    .describe("ISO 4217 code of the printed value: IDR for rupiah, USD for dollars, and so on"),
  currentValue: z
    .number()
    .describe(
      "Current market value as printed, in the given currency: an integer when IDR, decimals allowed otherwise",
    ),
  units: z.number().nullable().describe("Units, shares or coins held, if shown"),
  unrealizedGainLoss: nullableRupiah.describe("Unrealised gain (positive) or loss (negative)"),
  lockedUntil: isoDate.nullable().describe("Maturity or lock-up end date, if the product has one"),
});

export const extractedPortfolioSchema = z.object({
  provider: z.string().describe("App or broker name, e.g. Bibit, Ajaib, Pluang"),
  accountNumber: z
    .string()
    .nullable()
    .describe("Account or client id as printed; null if not shown"),
  asOfDate: isoDate.nullable().describe("Date the values are shown for"),
  currency: z.string().describe("ISO 4217 code the totals are printed in"),
  totalValue: z.number().nullable().describe("Total portfolio value as printed, in that currency"),
  holdings: z.array(extractedHoldingSchema),
  warnings,
});

// ---- kinds ----

export type ExtractedTransaction = z.infer<typeof extractedTransactionSchema>;
export type ExtractedStatement = z.infer<typeof extractedStatementSchema>;
export type ExtractedLoanBill = z.infer<typeof extractedLoanBillSchema>;
export type ExtractedHolding = z.infer<typeof extractedHoldingSchema>;
export type ExtractedPortfolio = z.infer<typeof extractedPortfolioSchema>;

export type SchemaFamily = "statement" | "loanBill" | "portfolio";

export const schemaFamilyOf: Record<SourceKind, SchemaFamily> = {
  bank: "statement",
  ewallet: "statement",
  paylater: "loanBill",
  pinjol: "loanBill",
  investment: "portfolio",
};

export const schemaByFamily = {
  statement: extractedStatementSchema,
  loanBill: extractedLoanBillSchema,
  portfolio: extractedPortfolioSchema,
} as const;

export type ExtractedByFamily = {
  statement: ExtractedStatement;
  loanBill: ExtractedLoanBill;
  portfolio: ExtractedPortfolio;
};

export function schemaFor(kind: SourceKind) {
  return schemaByFamily[schemaFamilyOf[kind]];
}

/**
 * JSON Schema for Gemini's `responseJsonSchema`. Zod's draft 2020-12 output is close to the
 * subset the API documents (type, properties, required, enum, items, anyOf, additionalProperties).
 * Two adjustments: the `$schema` marker goes, and nullable fields that zod writes as
 * `type: ["string", "null"]` become `anyOf`, the form the API lists as supported. The
 * safe-integer bounds zod adds for `.int()` are dropped as noise.
 */
export function responseJsonSchemaFor(kind: SourceKind): Record<string, unknown> {
  return geminiJsonSchema(schemaFor(kind));
}

/** A zod schema as the JSON Schema subset Gemini accepts for responses and tool parameters. */
export function geminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io: "output",
  });
  return toGeminiSubset(rest) as Record<string, unknown>;
}

function toGeminiSubset(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSubset);
  if (!node || typeof node !== "object") return node;
  const record = node as Record<string, unknown>;

  // `type: ["string", "null"]` -> `anyOf: [{ type: "string", ...constraints }, { type: "null" }]`,
  // keeping description and title on the outer node.
  if (Array.isArray(record.type) && record.type.length === 2 && record.type[1] === "null") {
    const { type, description, title, ...constraints } = record;
    const outer: Record<string, unknown> = {};
    if (description !== undefined) outer.description = description;
    if (title !== undefined) outer.title = title;
    outer.anyOf = [toGeminiSubset({ ...constraints, type: type[0] }), { type: "null" }];
    return outer;
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const isSafeIntBound =
      (key === "minimum" || key === "maximum") &&
      Math.abs(value as number) === Number.MAX_SAFE_INTEGER;
    if (isSafeIntBound) continue;
    out[key] =
      key === "properties"
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([k, v]) => [
              k,
              toGeminiSubset(v),
            ]),
          )
        : toGeminiSubset(value);
  }
  return out;
}
