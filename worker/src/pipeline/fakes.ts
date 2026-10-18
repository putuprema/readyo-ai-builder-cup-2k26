import type {
  Analysis,
  Goal,
  MonthRecord,
  Override,
  RuleValue,
  RunStatus,
  UserRecord,
} from "@adidi/shared";
import type { Content } from "@google/genai";
import { WRITER_SYSTEM_INSTRUCTION } from "../agent/writer.js";
import type {
  JsonModel,
  JsonRequest,
  ToolCall,
  ToolModel,
  ToolStepRequest,
  ToolStepResponse,
} from "../gemini/client.js";
import { CLASSIFY_SYSTEM_INSTRUCTION } from "../normalization/classify.js";
import type { RunStore } from "./ports.js";

// In-memory run store for the pipeline tests. Single user: the uid is checked but not used as
// a key, which keeps the test setup short.

export class FakeRunStore implements RunStore {
  readonly runs = new Map<string, RunStatus>();
  readonly users = new Map<string, UserRecord>();
  readonly goals = new Map<string, Goal>();
  readonly months = new Map<string, MonthRecord>();
  readonly analyses = new Map<string, Analysis>(); // key: `${goalId}/${month}`
  rules: RuleValue[] = [];
  overrides: Override[] = [];
  /** Every run patch in order, so tests check the stage sequence the UI listener would see. */
  readonly runPatches: Partial<RunStatus>[] = [];

  async getRun(_uid: string, runId: string) {
    return this.runs.get(runId) ?? null;
  }

  async updateRun(_uid: string, runId: string, patch: Partial<RunStatus>) {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`no run ${runId}`);
    this.runs.set(runId, { ...run, ...patch });
    this.runPatches.push(patch);
  }

  async getUser(uid: string) {
    return this.users.get(uid) ?? null;
  }

  async getGoal(_uid: string, goalId: string) {
    return this.goals.get(goalId) ?? null;
  }

  async updateGoal(_uid: string, goalId: string, patch: Partial<Goal>) {
    const goal = this.goals.get(goalId);
    if (!goal) throw new Error(`no goal ${goalId}`);
    this.goals.set(goalId, { ...goal, ...patch });
  }

  async listRules() {
    return this.rules;
  }

  async listOverrides() {
    return this.overrides;
  }

  async getMonth(_uid: string, month: string) {
    return this.months.get(month) ?? null;
  }

  async listMonths() {
    return [...this.months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, record]) => ({ month, record }));
  }

  async setMonth(_uid: string, month: string, record: MonthRecord) {
    this.months.set(month, record);
  }

  async getAnalysis(_uid: string, goalId: string, month: string) {
    return this.analyses.get(`${goalId}/${month}`) ?? null;
  }

  async setAnalysis(_uid: string, goalId: string, month: string, analysis: Analysis) {
    this.analyses.set(`${goalId}/${month}`, analysis);
  }

  /** The stages written to the run document, in order. */
  stagesSeen(): string[] {
    return this.runPatches.flatMap((p) => (p.stage ? [p.stage] : []));
  }
}

// ---- a scripted model for whole-pipeline tests ----

export interface FakePipelineModelScript {
  /** Extraction answers in document order (the stage reads documents one by one). */
  extraction: (unknown | Error)[];
  /** The writer's answer; `{ cards: [], summary: "" }` forces the template texts. */
  writer?: unknown;
  /** The agent's turns: tool calls or a closing sentence. */
  turns?: (ToolCall[] | string)[];
  /** Called before every answer; throw here to inject a failure at a chosen point. */
  before?: (request: JsonRequest | ToolStepRequest) => void;
}

/**
 * Routes each request to the right scripted answer: files → extraction, the classification
 * instruction → every row classified by direction, the writer instruction → the writer
 * answer, tool steps → the agent turns. Records the requests by kind.
 */
export class FakePipelineModel implements JsonModel, ToolModel {
  readonly extractionRequests: JsonRequest[] = [];
  readonly classifyRequests: JsonRequest[] = [];
  readonly writerRequests: JsonRequest[] = [];
  readonly stepRequests: ToolStepRequest[] = [];
  private readonly extraction: (unknown | Error)[];
  private readonly turns: (ToolCall[] | string)[];

  constructor(private readonly script: FakePipelineModelScript) {
    this.extraction = [...script.extraction];
    this.turns = [...(script.turns ?? [])];
  }

  async generateJson(request: JsonRequest): Promise<unknown> {
    this.script.before?.(request);
    if (request.files) {
      this.extractionRequests.push(request);
      const next = this.extraction.shift();
      if (next === undefined) throw new Error("fake model: no extraction answer left");
      if (next instanceof Error) throw next;
      return structuredClone(next);
    }
    if (request.systemInstruction === CLASSIFY_SYSTEM_INSTRUCTION) {
      this.classifyRequests.push(request);
      return classifyByDirection(request.prompt);
    }
    if (request.systemInstruction === WRITER_SYSTEM_INSTRUCTION) {
      this.writerRequests.push(request);
      return structuredClone(this.script.writer ?? { cards: [], summary: "" });
    }
    return structuredClone(this.script.writer ?? {});
  }

  async step(request: ToolStepRequest): Promise<ToolStepResponse> {
    this.script.before?.(request);
    this.stepRequests.push(request);
    const turn = this.turns.shift() ?? "I have nothing more to test.";
    if (typeof turn === "string") {
      return { content: { role: "model", parts: [{ text: turn }] }, functionCalls: [], text: turn };
    }
    const calls = turn.map((call, i) => ({ ...call, id: `call-${this.stepRequests.length}-${i}` }));
    const content: Content = {
      role: "model",
      parts: calls.map((call) => ({
        functionCall: { id: call.id, name: call.name, args: call.args },
      })),
    };
    return { content, functionCalls: calls };
  }
}

/** Reads the `ref | date | direction | ...` rows of a classification prompt. */
function classifyByDirection(prompt: string): {
  items: { ref: string; cls: string; category: string }[];
} {
  const items: { ref: string; cls: string; category: string }[] = [];
  for (const line of prompt.split("\n")) {
    const parts = line.split(" | ");
    if (parts.length < 3 || !parts[0] || parts[0].includes(" ")) continue;
    const direction = parts[2];
    items.push(
      direction === "in"
        ? { ref: parts[0], cls: "income", category: "salary" }
        : { ref: parts[0], cls: "discretionary", category: "shopping" },
    );
  }
  return { items };
}
