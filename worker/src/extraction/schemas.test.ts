import type { SourceKind } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { sampleLoanBill, samplePortfolio, sampleStatement } from "./samples.js";
import {
  extractedLoanBillSchema,
  extractedPortfolioSchema,
  extractedStatementSchema,
  responseJsonSchemaFor,
  schemaFamilyOf,
  schemaFor,
} from "./schemas.js";

// specs/04-extraction.md task 1: one response schema per source kind, matching the shared
// types, with amounts as integers in rupiah and unreadable fields as null.

describe("schemaFor", () => {
  it("maps every source kind to a schema family", () => {
    const kinds: SourceKind[] = ["bank", "ewallet", "paylater", "pinjol", "investment"];
    for (const kind of kinds) {
      expect(schemaFamilyOf[kind]).toBeDefined();
      expect(schemaFor(kind)).toBeDefined();
    }
    expect(schemaFor("bank")).toBe(extractedStatementSchema);
    expect(schemaFor("ewallet")).toBe(extractedStatementSchema);
    expect(schemaFor("paylater")).toBe(extractedLoanBillSchema);
    expect(schemaFor("pinjol")).toBe(extractedLoanBillSchema);
    expect(schemaFor("investment")).toBe(extractedPortfolioSchema);
  });
});

describe("statement schema", () => {
  it("accepts a bank statement with null unreadable fields", () => {
    const parsed = extractedStatementSchema.parse(sampleStatement);
    expect(parsed.transactions).toHaveLength(3);
    expect(parsed.transactions[2]?.date).toBeNull();
  });

  it("rejects non-integer amounts and unknown directions", () => {
    const bad = structuredClone(sampleStatement);
    (bad.transactions[0] as { amount: number }).amount = 15_000_000.5;
    expect(extractedStatementSchema.safeParse(bad).success).toBe(false);

    const badDirection = structuredClone(sampleStatement);
    (badDirection.transactions[0] as { direction: string }).direction = "DB";
    expect(extractedStatementSchema.safeParse(badDirection).success).toBe(false);
  });

  it("rejects dates that are not YYYY-MM-DD", () => {
    const bad = structuredClone(sampleStatement);
    (bad.transactions[0] as { date: string }).date = "12/10/2026";
    expect(extractedStatementSchema.safeParse(bad).success).toBe(false);
  });
});

describe("loan bill schema", () => {
  it("accepts a PayLater bill with a monthly rate", () => {
    const parsed = extractedLoanBillSchema.parse(sampleLoanBill);
    expect(parsed.fee).toEqual({ kind: "monthly_rate", value: 0.0295 });
  });

  it("rejects an unknown fee kind", () => {
    const bad = structuredClone(sampleLoanBill);
    (bad.fee as { kind: string }).kind = "weekly";
    expect(extractedLoanBillSchema.safeParse(bad).success).toBe(false);
  });
});

describe("portfolio schema", () => {
  it("accepts holdings of every listed instrument type", () => {
    const parsed = extractedPortfolioSchema.parse(samplePortfolio);
    expect(parsed.holdings.map((h) => h.instrumentType)).toEqual([
      "money_market_fund",
      "stock",
      "crypto",
    ]);
  });

  it("rejects a holding without a current value", () => {
    const bad = structuredClone(samplePortfolio) as { holdings: Record<string, unknown>[] };
    delete bad.holdings[0]?.currentValue;
    expect(extractedPortfolioSchema.safeParse(bad).success).toBe(false);
  });
});

describe("responseJsonSchemaFor", () => {
  it.each(["bank", "ewallet", "paylater", "pinjol", "investment"] as SourceKind[])(
    "produces a JSON schema Gemini accepts for %s",
    (kind) => {
      const schema = responseJsonSchemaFor(kind);
      expect(schema).not.toHaveProperty("$schema");
      expect(schema.type).toBe("object");
      const required = schema.required as string[];
      const properties = schema.properties as Record<string, unknown>;
      // Every property is required: structured output fills nullable fields with null
      // instead of leaving them out.
      expect(required.sort()).toEqual(Object.keys(properties).sort());
      // Only keywords from the API's supported subset appear anywhere in the tree.
      const allowed = new Set([
        "type",
        "properties",
        "required",
        "enum",
        "items",
        "anyOf",
        "additionalProperties",
        "description",
        "pattern",
        "minimum",
        "maximum",
        "title",
        "format",
      ]);
      const keywords = new Set<string>();
      const walk = (node: unknown) => {
        if (Array.isArray(node)) {
          for (const item of node) walk(item);
          return;
        }
        if (node && typeof node === "object") {
          for (const [key, value] of Object.entries(node)) {
            if (key !== "properties") keywords.add(key);
            // Property names themselves are not keywords.
            if (key === "properties") {
              for (const prop of Object.values(value as Record<string, unknown>)) walk(prop);
            } else {
              walk(value);
            }
          }
        }
      };
      walk(schema);
      for (const keyword of keywords) expect(allowed.has(keyword), keyword).toBe(true);
    },
  );

  it("encodes nullable fields as anyOf with null, never as a type array", () => {
    const schema = responseJsonSchemaFor("bank");
    const properties = schema.properties as Record<
      string,
      { anyOf?: { type: string }[]; type?: unknown; description?: string }
    >;
    expect(properties.accountNumber?.anyOf?.map((o) => o.type).sort()).toEqual(["null", "string"]);
    expect(properties.accountNumber?.description).toContain("Account");
    expect(properties.periodStart?.anyOf?.map((o) => o.type).sort()).toEqual(["null", "string"]);
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
      } else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          if (key === "type") expect(Array.isArray(value), "type array").toBe(false);
          walk(value);
        }
      }
    };
    walk(schema);
  });
});
