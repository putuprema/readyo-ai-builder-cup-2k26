import type { Transaction } from "@adidi/shared";
import { describe, expect, it } from "vitest";
import { FakeModel } from "../extraction/fakes.js";
import { ModelError } from "../gemini/client.js";
import { classificationJsonSchema, classifyTransactions } from "./classify.js";

// specs/04-extraction.md task 5: Flash classification, batched 50 at a time, structured output,
// with rule overrides and conservative defaults.

let seq = 0;
function txn(overrides: Partial<Transaction>): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    month: "2026-09",
    date: "2026-09-10",
    amount: 50_000,
    direction: "out",
    counterparty: "TOKOPEDIA",
    rawDescription: "TOKOPEDIA ORDER",
    sourceAccount: "BCA ****7890",
    sourceFileId: "f",
    ...overrides,
  };
}

/** A fake that answers every ref in the request with the given class and category. */
function answerAll(cls: string, category: string) {
  return {
    generateJson: async (request: { prompt: string }) => {
      const refs = [...request.prompt.matchAll(/^(r\d+) \|/gm)].map((m) => m[1]);
      return { items: refs.map((ref) => ({ ref, cls, category })) };
    },
  };
}

describe("classifyTransactions", () => {
  it("applies rules first and sends only the rest to the Flash tier", async () => {
    const model = new FakeModel({
      items: [{ ref: "r1", cls: "discretionary", category: "shopping" }],
    });
    const result = await classifyTransactions(
      [
        txn({
          id: "salary",
          direction: "in",
          amount: 15_000_000,
          counterparty: "PT MAJU JAYA",
          rawDescription: "GAJI SEPT",
        }),
        txn({ id: "shop" }),
        txn({ id: "transfer", cls: "own_transfer", category: "own_transfer" }),
      ],
      model,
    );
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0]?.tier).toBe("flash");
    expect(model.requests[0]?.prompt).toContain(
      "r1 | 2026-09-10 | out | 50000 | TOKOPEDIA | TOKOPEDIA ORDER",
    );
    expect(model.requests[0]?.prompt).not.toContain("GAJI");
    expect(result.byRule).toBe(1);
    expect(result.byModel).toBe(1);
    expect(result.alreadyClassified).toBe(1);
    expect(result.fallback).toBe(0);
    const byId = new Map(result.transactions.map((t) => [t.id, t]));
    expect(byId.get("salary")).toMatchObject({ cls: "income", category: "salary" });
    expect(byId.get("shop")).toMatchObject({ cls: "discretionary", category: "shopping" });
    expect(byId.get("transfer")).toMatchObject({ cls: "own_transfer" });
  });

  it("batches 50 rows per call and maps answers back by ref", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => txn({ id: `row${i}`, amount: 1_000 + i }));
    const calls: number[] = [];
    const model = {
      generateJson: async (request: { prompt: string }) => {
        const refs = [...request.prompt.matchAll(/^(r\d+) \|/gm)].map((m) => m[1]);
        calls.push(refs.length);
        return { items: refs.map((ref) => ({ ref, cls: "essential", category: "groceries" })) };
      },
    };
    const result = await classifyTransactions(rows, model);
    expect(calls).toEqual([50, 50, 20]);
    expect(result.byModel).toBe(120);
    expect(result.transactions.every((t) => t.cls === "essential")).toBe(true);
    // Order of the output follows the input.
    expect(result.transactions.map((t) => t.id)).toEqual(rows.map((t) => t.id));
  });

  it("gives unanswered rows a counted default and says so", async () => {
    const model = new FakeModel({
      items: [{ ref: "r1", cls: "essential", category: "groceries" }],
    });
    const result = await classifyTransactions(
      [txn({ id: "a" }), txn({ id: "b" }), txn({ id: "c", direction: "in", counterparty: "BUDI" })],
      model,
    );
    expect(result.byModel).toBe(1);
    expect(result.fallback).toBe(2);
    const byId = new Map(result.transactions.map((t) => [t.id, t]));
    expect(byId.get("b")).toMatchObject({ cls: "discretionary", category: "other_spending" });
    expect(byId.get("c")).toMatchObject({ cls: "income", category: "other_income" });
    expect(result.warnings).toEqual(["Classification left 2 row(s) unanswered; defaults used"]);
  });

  it("survives a failed batch with defaults and a warning instead of failing the run", async () => {
    const model = new FakeModel(new ModelError("api_error", "Gemini API error 503"));
    const result = await classifyTransactions([txn({}), txn({})], model);
    expect(result.fallback).toBe(2);
    expect(result.warnings).toEqual(["Classification batch 1 failed: Gemini API error 503"]);
  });

  it("ignores refs the model invents and rejects answers outside the schema", async () => {
    const invented = new FakeModel({
      items: [
        { ref: "r1", cls: "essential", category: "groceries" },
        { ref: "r9", cls: "essential", category: "groceries" },
      ],
    });
    const one = await classifyTransactions([txn({})], invented);
    expect(one.byModel).toBe(1);

    const badClass = new FakeModel({
      items: [{ ref: "r1", cls: "savings", category: "groceries" }],
    });
    const bad = await classifyTransactions([txn({})], badClass);
    expect(bad.fallback).toBe(1);
    expect(bad.warnings[0]).toContain("did not match the schema");
  });

  it("derives the class from the model's category, ignoring a contradicting class", async () => {
    const model = new FakeModel({
      items: [
        { ref: "r1", cls: "discretionary", category: "bank_fees" },
        { ref: "r2", cls: "essential", category: "dining" },
        { ref: "r3", cls: "income", category: "installment" },
      ],
    });
    const result = await classifyTransactions([txn({}), txn({}), txn({})], model);
    expect(result.transactions.map((t) => t.cls)).toEqual([
      "essential",
      "discretionary",
      "debt_payment",
    ]);
  });

  it("does not call the model when every row is already decided", async () => {
    const model = new FakeModel({ items: [] });
    await classifyTransactions([txn({ rawDescription: "TARIKAN ATM" })], model);
    expect(model.requests).toHaveLength(0);
  });

  it("answers every ref through a schema with the class and category enums", () => {
    const schema = classificationJsonSchema();
    const items = (schema.properties as Record<string, { items: Record<string, unknown> }>).items;
    const props = items.items.properties as Record<string, { enum?: string[] }>;
    expect(props.cls?.enum).toEqual([
      "income",
      "essential",
      "discretionary",
      "debt_payment",
      "investment",
    ]);
    expect(props.category?.enum).toContain("food_delivery");
    expect(schema).not.toHaveProperty("$schema");
  });

  it("works with a model that classifies everything one way", async () => {
    const result = await classifyTransactions(
      [txn({}), txn({})],
      answerAll("discretionary", "dining"),
    );
    expect(result.transactions.map((t) => t.category)).toEqual(["dining", "dining"]);
  });
});
