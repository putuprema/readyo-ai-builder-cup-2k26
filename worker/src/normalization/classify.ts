import type { Transaction } from "@adidi/shared";
import { z } from "zod";
import type { JsonModel } from "../gemini/client.js";
import { applyRules, type Category, type Classification, categories } from "./rules.js";

// Stage 3 step 3 (specs/04-extraction.md): classify every transaction into
// income | essential | discretionary | debt_payment | investment | own_transfer | cash plus a
// category. Rules first (rules.ts); what is left goes to the Flash tier in batches of 50 with
// structured output. Rows the model does not answer for, or a batch that fails, fall back to a
// conservative default rather than failing the run.

export const CLASSIFY_BATCH_SIZE = 50;

const modelClasses = [
  "income",
  "essential",
  "discretionary",
  "debt_payment",
  "investment",
] as const;

const classificationItemSchema = z.object({
  ref: z.string().describe("The ref of the row, copied exactly"),
  cls: z.enum(modelClasses),
  category: z.enum(categories),
});

export const classificationResponseSchema = z.object({
  items: z.array(classificationItemSchema),
});

export function classificationJsonSchema(): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(classificationResponseSchema, {
    target: "draft-2020-12",
    io: "output",
  });
  return rest;
}

export const CLASSIFY_SYSTEM_INSTRUCTION = `You classify personal bank and e-wallet transactions of an Indonesian user into spending classes for a financial readiness check.

Classes:
- income: salary, freelance payments, bonuses, interest, refunds and cashback, money received from others.
- essential: rent, utilities, groceries, insurance, health, education, fuel, daily transport, family support.
- discretionary: dining, food delivery, shopping, entertainment, subscriptions, travel, hobbies.
- debt_payment: instalments, loan repayments, credit card or PayLater bills.
- investment: buying funds, stocks, bonds, gold or crypto, or deposits into an investment product.

Rules: credits (direction in) are income unless clearly a refund of a purchase (then income, category refund). Transfers to other people's accounts for goods or services are spending. When unsure between essential and discretionary, pick discretionary. Pick exactly one category from the list for each row. Return one item per ref, copying the ref exactly.`;

export interface ClassifyOptions {
  batchSize?: number;
  /** Receives one short line per event, never row content. */
  log?: (message: string) => void;
}

export interface ClassifyResult {
  transactions: Transaction[];
  byRule: number;
  byModel: number;
  /** Rows that kept the class they already had (own transfers from the matching step). */
  alreadyClassified: number;
  /** Rows the model did not answer for, or whose batch failed; given the default class. */
  fallback: number;
  warnings: string[];
}

export async function classifyTransactions(
  transactions: Transaction[],
  model: JsonModel,
  options: ClassifyOptions = {},
): Promise<ClassifyResult> {
  const batchSize = options.batchSize ?? CLASSIFY_BATCH_SIZE;
  const log = options.log ?? (() => {});
  const out = new Map<string, Transaction>();
  const pending: Transaction[] = [];
  let byRule = 0;
  let alreadyClassified = 0;

  for (const t of transactions) {
    if (t.cls) {
      alreadyClassified += 1;
      out.set(t.id, t);
      continue;
    }
    const ruled = applyRules(t);
    if (ruled) {
      byRule += 1;
      out.set(t.id, { ...t, cls: ruled.cls, category: ruled.category });
      continue;
    }
    pending.push(t);
  }

  let byModel = 0;
  let fallback = 0;
  const warnings: string[] = [];

  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    const refs = new Map(batch.map((t, index) => [`r${index + 1}`, t]));
    let answers: Map<string, Classification>;
    try {
      answers = await askModel(model, refs);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      warnings.push(`Classification batch ${i / batchSize + 1} failed: ${reason}`);
      log(`classification batch ${i / batchSize + 1}: failed (${reason}); defaults used`);
      answers = new Map();
    }
    let missing = 0;
    for (const [ref, t] of refs) {
      const answer = answers.get(ref);
      if (answer) {
        byModel += 1;
        out.set(t.id, { ...t, cls: answer.cls, category: answer.category });
      } else {
        missing += 1;
        fallback += 1;
        out.set(t.id, { ...t, ...defaultClassification(t) });
      }
    }
    if (missing > 0 && answers.size > 0) {
      warnings.push(`Classification left ${missing} row(s) unanswered; defaults used`);
    }
    log(
      `classification batch ${i / batchSize + 1}: ${batch.length} rows, ${answers.size} answered`,
    );
  }

  return {
    transactions: transactions.map((t) => out.get(t.id) ?? t),
    byRule,
    byModel,
    alreadyClassified,
    fallback,
    warnings,
  };
}

async function askModel(
  model: JsonModel,
  refs: Map<string, Transaction>,
): Promise<Map<string, Classification>> {
  const lines = [...refs].map(
    ([ref, t]) =>
      `${ref} | ${t.date} | ${t.direction} | ${t.amount} | ${t.counterparty || "-"} | ${t.rawDescription || "-"}`,
  );
  const raw = await model.generateJson({
    tier: "flash",
    systemInstruction: CLASSIFY_SYSTEM_INSTRUCTION,
    prompt: `Classify these rows (ref | date | direction | amount in rupiah | counterparty | description):\n\n${lines.join("\n")}`,
    responseJsonSchema: classificationJsonSchema(),
  });
  const parsed = classificationResponseSchema.safeParse(raw);
  if (!parsed.success) throw new Error("the model's answer did not match the schema");
  const answers = new Map<string, Classification>();
  for (const item of parsed.data.items) {
    if (refs.has(item.ref)) answers.set(item.ref, { cls: item.cls, category: item.category });
  }
  return answers;
}

/** Counted, never hidden: credits as income, debits as discretionary spending. */
export function defaultClassification(t: Transaction): Classification {
  const category: Category = t.direction === "in" ? "other_income" : "other_spending";
  return { cls: t.direction === "in" ? "income" : "discretionary", category };
}
