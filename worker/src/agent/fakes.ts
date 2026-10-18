import type { Content } from "@google/genai";
import type {
  JsonModel,
  JsonRequest,
  ToolCall,
  ToolModel,
  ToolStepRequest,
  ToolStepResponse,
} from "../gemini/client.js";

// Scripted models for the agent tests: one scripted turn per model step, each either a list of
// tool calls or a closing sentence. A turn may be a function of the step request so a test can
// react to the previous tool response.

export type ScriptedTurn = ToolCall[] | string | Error;
export type ScriptedTurnFn = (request: ToolStepRequest) => ScriptedTurn;

export class FakeToolModel implements ToolModel {
  readonly requests: ToolStepRequest[] = [];
  private readonly turns: (ScriptedTurn | ScriptedTurnFn)[];

  constructor(turns: (ScriptedTurn | ScriptedTurnFn)[]) {
    this.turns = [...turns];
  }

  async step(request: ToolStepRequest): Promise<ToolStepResponse> {
    this.requests.push(request);
    const next = this.turns.shift();
    const turn = typeof next === "function" ? next(request) : next;
    if (turn === undefined) return done("I have nothing more to test.");
    if (turn instanceof Error) throw turn;
    if (typeof turn === "string") return done(turn);
    const calls = turn.map((call, i) => ({
      ...call,
      id: call.id ?? `call-${this.requests.length}-${i}`,
    }));
    const content: Content = {
      role: "model",
      parts: calls.map((call) => ({
        functionCall: { id: call.id, name: call.name, args: call.args },
      })),
    };
    return { content, functionCalls: calls };
  }

  /** The function responses the loop sent back, in order, flattened. */
  functionResponses(): Record<string, unknown>[] {
    const last = this.requests[this.requests.length - 1];
    if (!last) return [];
    const out: Record<string, unknown>[] = [];
    for (const content of last.history) {
      for (const part of content.parts ?? []) {
        if (part.functionResponse?.response) out.push(part.functionResponse.response);
      }
    }
    return out;
  }
}

function done(text: string): ToolStepResponse {
  return { content: { role: "model", parts: [{ text }] }, functionCalls: [], text };
}

/** A JsonModel answering from a queue, for the writer tests; the last answer repeats. */
export class FakeJsonModel implements JsonModel {
  readonly requests: JsonRequest[] = [];
  private readonly answers: (unknown | Error)[];

  constructor(answers: (unknown | Error)[]) {
    this.answers = [...answers];
  }

  async generateJson(request: JsonRequest): Promise<unknown> {
    this.requests.push(request);
    const next = this.answers.length > 1 ? this.answers.shift() : this.answers[0];
    if (next instanceof Error) throw next;
    return structuredClone(next);
  }
}

export const call = (name: string, args: Record<string, unknown> = {}): ToolCall => ({
  name,
  args,
});
