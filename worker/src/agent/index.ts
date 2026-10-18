import type { ActionCard, ActionChoice, Analysis, SimulationResult } from "@adidi/shared";
import type { JsonModel, ModelTier, ToolModel } from "../gemini/client.js";
import { type ActionFacts, buildActionFacts } from "./cards.js";
import { type AgentInput, createAgentContext } from "./context.js";
import { runProposeVerifyLoop, type StopReason, type ToolTrace, TURN_TIMEOUT_MS } from "./loop.js";
import { buildSummaryFacts } from "./summary.js";
import { writeCards } from "./writer.js";

// Stage 6 for one goal (specs/06-agent.md): the propose → verify loop, then the cards and
// the headline sentence. Returns the pieces of the Analysis the pipeline (spec 07) stores
// next to the metrics; nothing here touches Firestore.

export type { ActionFacts } from "./cards.js";
export { buildActionFacts } from "./cards.js";
export type {
  AgentContext,
  AgentInput,
  LeadingPath,
} from "./context.js";
export { createAgentContext, leadingPathOf } from "./context.js";
export type { KeptAction, LoopResult, ToolTrace } from "./loop.js";
export { MAX_ACTIONS, MAX_TOOL_CALLS, runProposeVerifyLoop, TURN_TIMEOUT_MS } from "./loop.js";
export { checkNumbers, numbersIn } from "./numbers.js";
export { buildSummaryFacts } from "./summary.js";
export { writeCards } from "./writer.js";

export interface AgentOptions {
  maxToolCalls?: number;
  maxActions?: number;
  /** Per model turn of the loop (default agent/limits.json). */
  turnTimeoutMs?: number;
  /** Model tier for the loop and the writer (default pro, as the spec says). */
  tier?: ModelTier;
  log?: (message: string) => void;
}

export type AgentAnalysis = Pick<
  Analysis,
  "withoutPlan" | "withPlan" | "actions" | "choices" | "rejectedOptions" | "summary"
>;

export interface AgentResult extends AgentAnalysis {
  /** The facts each card was written from, for logs and tests. */
  facts: ActionFacts[];
  toolCalls: number;
  trace: ToolTrace[];
  stoppedBecause: StopReason;
  /** Card ids whose text is the template, and whether the summary is. */
  fallbackIds: string[];
  summaryFromFallback: boolean;
  warnings: string[];
}

export async function runAgent(
  input: AgentInput,
  model: ToolModel & JsonModel,
  options: AgentOptions = {},
): Promise<AgentResult> {
  const ctx = createAgentContext(input);
  const loopOptions = {
    ...(options.maxToolCalls === undefined ? {} : { maxToolCalls: options.maxToolCalls }),
    ...(options.maxActions === undefined ? {} : { maxActions: options.maxActions }),
    ...(options.turnTimeoutMs === undefined ? {} : { turnTimeoutMs: options.turnTimeoutMs }),
    ...(options.tier === undefined ? {} : { tier: options.tier }),
    ...(options.log === undefined ? {} : { log: options.log }),
  };
  const loop = await runProposeVerifyLoop(ctx, model, loopOptions);
  const facts = loop.kept.map((kept, i) => buildActionFacts(ctx, kept, i));
  const summary = buildSummaryFacts(ctx, loop.withPlan, facts);
  const written = await writeCards(ctx, facts, model, { ...loopOptions, summary });

  const warnings = [...written.warnings];
  if (loop.error) warnings.push(`Agent loop ended early: ${loop.error}`);
  if (loop.stoppedBecause === "model_timeout") {
    const ms = options.turnTimeoutMs ?? TURN_TIMEOUT_MS;
    warnings.push(`Agent loop ended early: a model turn took longer than ${ms} ms`);
  }

  return {
    withoutPlan: ctx.withoutPlan,
    withPlan: loop.withPlan,
    actions: written.cards,
    choices: initialChoices(written.cards),
    rejectedOptions: ctx.withoutPlan.rejectedOptions,
    summary: written.summary,
    facts,
    toolCalls: loop.toolCalls,
    trace: loop.trace,
    stoppedBecause: loop.stoppedBecause,
    fallbackIds: written.fallbackIds,
    summaryFromFallback: written.summaryFromFallback,
    warnings,
  };
}

export function initialChoices(actions: ActionCard[]): Record<string, ActionChoice> {
  return Object.fromEntries(actions.map((a) => [a.id, "undecided" as const]));
}

/** Months to ready on the plan's leading path, for logs: null when never. */
export function planMonths(result: SimulationResult, leading: "cash" | "loan"): number | null {
  return leading === "loan" && result.loan ? result.loan.monthsToReady : result.cash.monthsToReady;
}
