import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DocumentRecord, SourceKind } from "@adidi/shared";
import { z } from "zod";

// Discovery of the team's anonymised statements and their hand-written expectations
// (fixtures/README.md). A statement `fixtures/statements/<name>.<pdf|png|jpg>` pairs with
// `fixtures/expected/<name>.json`, which names the source kind and month and lists the rows
// extraction should return.

export const FIXTURES_DIR = resolve(fileURLToPath(new URL("../../fixtures", import.meta.url)));
export const STATEMENTS_DIR = join(FIXTURES_DIR, "statements");
export const EXPECTED_DIR = join(FIXTURES_DIR, "expected");

const sourceKinds = ["bank", "ewallet", "paylater", "pinjol", "investment"] as const;

export const expectedTransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().int(),
  direction: z.enum(["in", "out"]),
  counterparty: z.string().optional(),
  /** Hand label used by the classification check (task 5), e.g. "own_transfer", "income". */
  cls: z.string().optional(),
});

export const expectedLoanSchema = z.object({
  lender: z.string().optional(),
  outstandingPrincipal: z.number().int(),
  monthlyInstallment: z.number().int(),
  effectiveAnnualRate: z.number().optional(),
  remainingTenorMonths: z.number().int().optional(),
});

export const expectedHoldingSchema = z
  .object({
    instrument: z.string(),
    /** Rupiah, for statements printed in rupiah. */
    currentValue: z.number().int().optional(),
    /** For statements in another currency: the printed value and its ISO code. */
    currency: z.string().optional(),
    nativeValue: z.number().optional(),
    volatile: z.boolean(),
    liquidityClass: z.enum(["cash", "liquid", "locked"]).optional(),
  })
  .refine(
    (h) =>
      h.currentValue !== undefined || (h.currency !== undefined && h.nativeValue !== undefined),
    { message: "give currentValue (rupiah) or currency + nativeValue" },
  );

export const expectedFileSchema = z.object({
  kind: z.enum(sourceKinds),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  transactions: z.array(expectedTransactionSchema).default([]),
  loans: z.array(expectedLoanSchema).default([]),
  holdings: z.array(expectedHoldingSchema).default([]),
});

export type ExpectedFile = z.infer<typeof expectedFileSchema>;

export interface Fixture {
  name: string;
  statementPath: string;
  mimeType: string;
  expected: ExpectedFile;
  document: DocumentRecord;
}

const mimeTypes: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/** Every statement that has an expected file. Statements without one are reported, not used. */
export function loadFixtures(): { fixtures: Fixture[]; unmatched: string[] } {
  if (!existsSync(STATEMENTS_DIR)) return { fixtures: [], unmatched: [] };
  const fixtures: Fixture[] = [];
  const unmatched: string[] = [];
  for (const file of readdirSync(STATEMENTS_DIR).sort()) {
    const ext = extname(file).toLowerCase();
    const mimeType = mimeTypes[ext];
    if (!mimeType) continue;
    const name = basename(file, extname(file));
    const expectedPath = join(EXPECTED_DIR, `${name}.json`);
    if (!existsSync(expectedPath)) {
      unmatched.push(file);
      continue;
    }
    const expected = expectedFileSchema.parse(JSON.parse(readFileSync(expectedPath, "utf8")));
    fixtures.push({
      name,
      statementPath: join(STATEMENTS_DIR, file),
      mimeType,
      expected,
      document: {
        id: `fixture_${name}`,
        name: file,
        type: mimeType,
        size: 0,
        sourceKind: expected.kind as SourceKind,
        month: expected.month,
        status: "uploaded",
        createdAt: "2026-10-18T00:00:00.000Z",
      },
    });
  }
  return { fixtures, unmatched };
}

export function readFixtureBytes(fixture: Fixture): Uint8Array {
  return new Uint8Array(readFileSync(fixture.statementPath));
}
