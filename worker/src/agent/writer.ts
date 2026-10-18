import type { ActionCard } from "@adidi/shared";
import { z } from "zod";
import { geminiJsonSchema } from "../extraction/schemas.js";
import { type JsonModel, ModelError, type ModelTier } from "../gemini/client.js";
import { type ActionFacts, allowedTexts, categoryLabel, productName } from "./cards.js";
import type { AgentContext } from "./context.js";
import { checkNumbers } from "./numbers.js";

// Card text (specs/06-agent.md, "Cards"): Gemini writes title, impactLine and description from
// the facts code built; the number check rejects any text with a number that is not in those
// facts. One retry names the offending numbers; after that the card falls back to a template
// made of the facts, so a run never fails for prose.

export const WRITER_SYSTEM_INSTRUCTION = `You write the action cards of a financial readiness planner for people in Indonesia, in plain English. Each card explains one verified action: what to do, what it changes and why.

Rules:
- Use only the numbers given in the facts, written exactly as given (for example "Rp 12.4 m", "31% a year", "17 months", "DTI 43% → 35%"). Never compute, convert, round or add a number, not even a year, a count or "two" as a digit. If a number is not in the facts, leave it out.
- Keep rupiah amounts in the given short form (Rp, k, m, bn). Keep KPR, KKB and lender names as given.
- title: one line naming the action and its size, no final period, at most 90 characters.
- impactLine: the impact fact, lightly phrased, at most 60 characters.
- description: one to three sentences on why it works for this person, in the second person. No emoji, no exclamation marks, no lists.
- Return one card per id, with the id copied exactly.`;

const writtenCardSchema = z.object({
  id: z.string().describe("The action id, copied exactly"),
  title: z.string().describe("One line naming the action and its size"),
  impactLine: z.string().describe("The impact fact, lightly phrased"),
  description: z.string().describe("One to three sentences in the second person"),
});

export const writtenCardsSchema = z.object({
  cards: z.array(writtenCardSchema),
});

export type WrittenCard = z.infer<typeof writtenCardSchema>;

export interface WriterOptions {
  tier?: ModelTier;
  /** Model attempts before the template fallback (default 2: one try, one retry). */
  maxAttempts?: number;
  log?: (message: string) => void;
}

export interface WriterResult {
  cards: ActionCard[];
  /** Ids whose text came from the template fallback. */
  fallbackIds: string[];
  attempts: number;
  warnings: string[];
}

export async function writeCards(
  ctx: AgentContext,
  facts: ActionFacts[],
  model: JsonModel,
  options: WriterOptions = {},
): Promise<WriterResult> {
  const log = options.log ?? (() => {});
  const maxAttempts = options.maxAttempts ?? 2;
  const warnings: string[] = [];
  const accepted = new Map<string, WrittenCard>();
  let attempts = 0;
  let feedback: string | undefined;

  if (facts.length > 0) {
    while (attempts < maxAttempts && accepted.size < facts.length) {
      attempts += 1;
      const pending = facts.filter((f) => !accepted.has(f.id));
      let raw: unknown;
      try {
        raw = await model.generateJson({
          tier: options.tier ?? "pro",
          systemInstruction: WRITER_SYSTEM_INSTRUCTION,
          prompt: writerPrompt(ctx, pending, feedback),
          responseJsonSchema: geminiJsonSchema(writtenCardsSchema),
          temperature: 0.2,
        });
      } catch (error) {
        const message = error instanceof ModelError ? error.message : "The model call failed";
        warnings.push(`Card writer attempt ${attempts} failed: ${message}`);
        log(`agent: card writer attempt ${attempts} failed (${message})`);
        continue;
      }
      const parsed = writtenCardsSchema.safeParse(raw);
      if (!parsed.success) {
        warnings.push(`Card writer attempt ${attempts}: answer did not match the schema`);
        feedback = "Your previous answer did not match the schema. Return one card per id.";
        continue;
      }
      const problems: string[] = [];
      for (const card of parsed.data.cards) {
        const fact = pending.find((f) => f.id === card.id);
        if (!fact) continue;
        const check = checkNumbers(cardText(card), allowedTexts(fact));
        if (check.ok) {
          accepted.set(card.id, card);
        } else {
          problems.push(`${card.id}: ${check.offending.join(", ")}`);
        }
      }
      for (const f of pending) {
        if (!accepted.has(f.id) && !parsed.data.cards.some((c) => c.id === f.id)) {
          problems.push(`${f.id}: missing`);
        }
      }
      if (problems.length > 0) {
        warnings.push(
          `Card writer attempt ${attempts}: numbers not in the facts (${problems.join("; ")})`,
        );
        log(`agent: card writer attempt ${attempts} rejected ${problems.length} card(s)`);
        feedback = `Your previous answer used numbers that are not in the facts, or missed a card: ${problems.join("; ")}. Rewrite those cards using only the numbers given, exactly as given.`;
      }
    }
  }

  const fallbackIds: string[] = [];
  const cards = facts.map((fact) => {
    const written = accepted.get(fact.id) ?? fallbackCard(ctx, fact);
    if (!accepted.has(fact.id)) fallbackIds.push(fact.id);
    return {
      id: fact.id,
      title: written.title,
      impactLine: written.impactLine,
      description: written.description,
      chips: fact.chips,
      monthsSaved: fact.monthsSaved,
      change: fact.change,
    } satisfies ActionCard;
  });
  if (fallbackIds.length > 0) log(`agent: template text for ${fallbackIds.join(", ")}`);
  return { cards, fallbackIds, attempts, warnings };
}

export function cardText(card: Pick<WrittenCard, "title" | "impactLine" | "description">): string {
  return `${card.title}\n${card.impactLine}\n${card.description}`;
}

export function writerPrompt(ctx: AgentContext, facts: ActionFacts[], feedback?: string): string {
  const lines: string[] = [];
  lines.push(
    `Goal: ${describeGoal(ctx)}. Leading path: ${ctx.leadingPath === "loan" ? `${productName(ctx)} approval` : "cash"}.`,
  );
  lines.push("");
  for (const f of facts) {
    lines.push(`Action ${f.id}: ${describeChange(f)}`);
    lines.push(`- impact: ${f.impact}`);
    lines.push(`- chips: ${f.chips.join(" | ")}`);
    for (const [key, value] of Object.entries(f.facts)) lines.push(`- ${key}: ${value}`);
    lines.push("");
  }
  if (feedback) lines.push(feedback);
  else lines.push("Write the cards.");
  return lines.join("\n");
}

function describeGoal(ctx: AgentContext): string {
  switch (ctx.goal.type) {
    case "house":
      return "a house bought with a KPR";
    case "car":
      return "a car bought with a KKB";
    case "wedding":
      return "a wedding paid in cash";
  }
}

function describeChange(f: ActionFacts): string {
  switch (f.change.type) {
    case "pay_off_loan":
      return "pay off a loan early from liquid savings";
    case "refinance_loan":
      return "refinance a loan to a cheaper rate and a new tenor";
    case "cap_spending":
      return "cap one discretionary spending category";
    case "move_assets":
      return "move volatile assets (stocks, funds, crypto) into liquid savings";
  }
}

/** Template text made only of the facts, used when the model's text fails the check. */
export function fallbackCard(ctx: AgentContext, f: ActionFacts): WrittenCard {
  const x = f.facts;
  const product = productName(ctx);
  switch (f.change.type) {
    case "pay_off_loan":
      return {
        id: f.id,
        title: `Pay off the ${x.outstanding} ${x.lender} balance from your savings`,
        impactLine: f.impact,
        description: `${x.installment} at ${x.rate} for another ${x.monthsLeft}. Clearing it takes the ${x.lender} installment out of your debt-to-income${
          x.interestSaved ? ` and saves ${x.interestSaved} of interest` : ""
        }${x.paidIn ? `; your savings cover it ${x.paidIn}` : ""}.`,
      };
    case "refinance_loan":
      return {
        id: f.id,
        title: `Refinance the ${x.outstanding} ${x.lender} loan at ${x.newRate} over ${x.newTenor}`,
        impactLine: f.impact,
        description: `Same debt at ${x.newRate} instead of ${x.rate}: the installment drops from ${x.installment} to ${x.newInstallment}, which lowers your debt-to-income${
          x.interestSaved ? ` and saves ${x.interestSaved} of interest` : ""
        }.`,
      };
    case "cap_spending":
      return {
        id: f.id,
        title: `Cap ${x.category} at ${x.cap}`,
        impactLine: f.impact,
        description: `${capitalize(x.category ?? "")} was ${x.spentNow} in ${x.month}. Capping it adds ${x.savesPerMonth} to your savings${
          ctx.leadingPath === "loan" ? ` for the ${product} down payment` : ""
        }.`,
      };
    case "move_assets":
      return {
        id: f.id,
        title: `Move ${x.amount} of volatile assets into liquid savings`,
        impactLine: f.impact,
        description: `Volatile assets count for nothing toward the goal until they are moved. In liquid savings the ${x.amount} ${
          ctx.leadingPath === "loan"
            ? `goes into the ${product} down payment`
            : "counts toward the goal"
        } (volatile share ${x.volatileShare}).`,
      };
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export { categoryLabel };
