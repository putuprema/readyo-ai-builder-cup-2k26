import type { Change, SimulationResult } from "@adidi/shared";
import type { Content } from "@google/genai";
import {
  functionResponseContent,
  ModelError,
  type ModelTier,
  type ToolCall,
  type ToolModel,
} from "../gemini/client.js";
import { type AgentContext, simulateWith } from "./context.js";
import { AGENT_SYSTEM_INSTRUCTION, agentPrompt } from "./prompt.js";
import {
  agentFunctionDeclarations,
  LIST_CATEGORIES_TOOL,
  LIST_LOANS_TOOL,
  listLoansTool,
  listSpendingCategoriesTool,
  SIMULATE_TOOL,
  simulateTool,
  viewOf,
} from "./tools.js";
import { type Verification, verifyCandidate } from "./verify.js";

// The propose → verify loop (specs/06-agent.md, "Loop"). The model proposes one candidate per
// simulate call; code runs it, decides whether it is kept and tells the model. The loop stops
// after three kept actions, after the tool-call budget, or when the model answers in words.

export const MAX_TOOL_CALLS = 8;
export const MAX_ACTIONS = 3;

export interface LoopOptions {
  maxToolCalls?: number;
  maxActions?: number;
  tier?: ModelTier;
  /** Receives one short line per event, never statement content. */
  log?: (message: string) => void;
}

export interface KeptAction {
  change: Change;
  /** The action alone against doing nothing. */
  alone: SimulationResult;
  verification: Verification;
}

export interface ToolTrace {
  call: number;
  name: string;
  /** For simulate calls: the candidate and the verdict. */
  change?: Change;
  kept?: boolean;
  error?: string;
}

export type StopReason = "actions" | "budget" | "model_done" | "model_error";

export interface LoopResult {
  kept: KeptAction[];
  /** simulate() with every kept action. */
  withPlan: SimulationResult;
  toolCalls: number;
  trace: ToolTrace[];
  stoppedBecause: StopReason;
  /** The model's closing words, if any. */
  modelText?: string;
  /** Set when the loop ended on a model error; the kept actions so far are still valid. */
  error?: string;
}

export async function runProposeVerifyLoop(
  ctx: AgentContext,
  model: ToolModel,
  options: LoopOptions = {},
): Promise<LoopResult> {
  const maxToolCalls = options.maxToolCalls ?? MAX_TOOL_CALLS;
  const maxActions = options.maxActions ?? MAX_ACTIONS;
  const log = options.log ?? (() => {});
  const tools = agentFunctionDeclarations(ctx);
  const history: Content[] = [{ role: "user", parts: [{ text: agentPrompt(ctx) }] }];

  const kept: KeptAction[] = [];
  const trace: ToolTrace[] = [];
  let keptResult = ctx.withoutPlan;
  let toolCalls = 0;
  let stoppedBecause: StopReason | undefined;
  let modelText: string | undefined;
  let error: string | undefined;

  while (stoppedBecause === undefined) {
    let step: Awaited<ReturnType<ToolModel["step"]>>;
    const startedAt = Date.now();
    try {
      step = await model.step({
        tier: options.tier ?? "pro",
        systemInstruction: AGENT_SYSTEM_INSTRUCTION,
        history: [...history],
        tools,
        thinking: "low",
      });
    } catch (e) {
      error = e instanceof ModelError ? e.message : "The model call failed";
      log(`agent: model error (${error}); keeping ${kept.length} action(s) found so far`);
      stoppedBecause = "model_error";
      break;
    }
    history.push(step.content);
    log(`agent: model turn in ${Date.now() - startedAt} ms (${step.functionCalls.length} call(s))`);
    if (step.text) modelText = step.text;
    if (step.functionCalls.length === 0) {
      stoppedBecause = "model_done";
      break;
    }

    const responses: { call: ToolCall; response: Record<string, unknown> }[] = [];
    for (const call of step.functionCalls) {
      if (toolCalls >= maxToolCalls) {
        responses.push({ call, response: { error: "Tool-call budget exhausted. Stop now." } });
        continue;
      }
      if (kept.length >= maxActions) {
        responses.push({ call, response: { error: "The plan is complete. Stop now." } });
        continue;
      }
      toolCalls += 1;
      const entry: ToolTrace = { call: toolCalls, name: call.name };
      trace.push(entry);

      switch (call.name) {
        case LIST_LOANS_TOOL:
          responses.push({ call, response: listLoansTool(ctx) });
          break;
        case LIST_CATEGORIES_TOOL:
          responses.push({ call, response: listSpendingCategoriesTool(ctx) });
          break;
        case SIMULATE_TOOL: {
          const result = simulateTool(ctx, keptChanges(kept), call.args);
          if (!result.ok) {
            entry.error = result.error;
            responses.push({ call, response: { error: result.error } });
            break;
          }
          const verification = verifyCandidate(ctx, keptResult, result.outcome);
          entry.change = result.outcome.change;
          entry.kept = verification.kept;
          if (verification.kept) {
            kept.push({ change: result.outcome.change, alone: result.outcome.alone, verification });
            keptResult = result.outcome.cumulative;
          }
          responses.push({
            call,
            response: {
              kept: verification.kept,
              reason: verification.reason,
              candidate: result.outcome.change,
              withThisChange: viewOf(ctx, result.outcome.cumulative),
              alone: viewOf(ctx, result.outcome.alone),
              keptSoFar: kept.length,
              toolCallsLeft: maxToolCalls - toolCalls,
            },
          });
          break;
        }
        default:
          entry.error = `Unknown tool ${call.name}`;
          responses.push({ call, response: { error: entry.error } });
      }
      log(
        `agent: tool call ${toolCalls}/${maxToolCalls} ${call.name}${
          entry.change ? ` ${entry.change.type}` : ""
        }${entry.kept === undefined ? "" : entry.kept ? " kept" : " dropped"}${
          entry.error ? " (rejected)" : ""
        }`,
      );
    }
    history.push(functionResponseContent(responses));

    if (kept.length >= maxActions) stoppedBecause = "actions";
    else if (toolCalls >= maxToolCalls) stoppedBecause = "budget";
  }

  const ordered = orderActions(ctx, kept);
  const withPlan = ordered.length === 0 ? ctx.withoutPlan : simulateWith(ctx, keptChanges(ordered));
  log(
    `agent: ${ordered.length} action(s) kept after ${toolCalls} tool call(s) (${stoppedBecause})`,
  );
  return {
    kept: ordered,
    withPlan,
    toolCalls,
    trace,
    stoppedBecause,
    ...(modelText ? { modelText } : {}),
    ...(error ? { error } : {}),
  };
}

export function keptChanges(kept: KeptAction[]): Change[] {
  return kept.map((k) => k.change);
}

/**
 * monthsSaved for a card: the action alone against doing nothing (the demo test pins that
 * reading). "Never within the horizon" counts as the month after the horizon, so an action
 * that turns never into month 17 outranks one that turns 20 into 15; the card text never
 * shows that figure as "months sooner" (see cards.ts). Both never: 0.
 */
export function monthsSaved(
  ctx: AgentContext,
  baseline: number | null,
  alone: number | null,
): number {
  if (alone === null) return 0;
  const before = baseline ?? ctx.maxMonths + 1;
  return Math.max(0, before - alone);
}

/** Spec order: by fromMonth, then by months saved (largest first). */
export function orderActions(ctx: AgentContext, kept: KeptAction[]): KeptAction[] {
  return [...kept].sort((a, b) => {
    if (a.change.fromMonth !== b.change.fromMonth) return a.change.fromMonth - b.change.fromMonth;
    const saved = (k: KeptAction) =>
      monthsSaved(ctx, k.verification.alone.monthsBefore, k.verification.alone.monthsAfter);
    return saved(b) - saved(a);
  });
}
