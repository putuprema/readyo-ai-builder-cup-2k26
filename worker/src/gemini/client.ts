import {
  type Content,
  createPartFromBase64,
  createUserContent,
  type FunctionCall,
  GoogleGenAI,
  type Part,
} from "@google/genai";

// The one place the worker talks to Gemini. Extraction, classification and card writing ask
// for structured JSON against a response schema (`JsonModel`); the recommendation agent runs
// a function-calling conversation one step at a time (`ToolModel`). Callers validate every
// answer with zod. Tests pass fakes for both.

export type ModelTier = "pro" | "flash";

export interface FilePart {
  bytes: Uint8Array;
  mimeType: string;
}

export interface JsonRequest {
  tier: ModelTier;
  systemInstruction: string;
  /** Files first, then the text prompt, in the order given. */
  files?: FilePart[];
  prompt: string;
  responseJsonSchema: Record<string, unknown>;
  temperature?: number;
}

export interface JsonModel {
  /** Returns the parsed JSON the model produced; throws ModelError on failure. */
  generateJson(request: JsonRequest): Promise<unknown>;
}

// ---- function calling (specs/06-agent.md) ----

export interface ToolDeclaration {
  name: string;
  description: string;
  /** JSON Schema of the arguments object; omitted for a tool without arguments. */
  parametersJsonSchema?: Record<string, unknown>;
}

export interface ToolStepRequest {
  tier: ModelTier;
  systemInstruction: string;
  /** The conversation so far: the user prompt, model turns, function responses. */
  history: Content[];
  tools: ToolDeclaration[];
  temperature?: number;
}

export interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolStepResponse {
  /** The model's turn as returned, to append to the history verbatim (it may carry thought
   *  signatures the next step needs). */
  content: Content;
  functionCalls: ToolCall[];
  /** The model's text, when it answered in words instead of (or besides) calling a tool. */
  text?: string;
}

export interface ToolModel {
  /** One model turn of a function-calling conversation; throws ModelError on failure. */
  step(request: ToolStepRequest): Promise<ToolStepResponse>;
}

/** Build the user turn that answers one or more function calls. */
export function functionResponseContent(
  responses: { call: ToolCall; response: Record<string, unknown> }[],
): Content {
  return {
    role: "user",
    parts: responses.map(({ call, response }) => ({
      functionResponse: {
        ...(call.id ? { id: call.id } : {}),
        name: call.name,
        response,
      },
    })),
  };
}

export type ModelErrorCode = "empty_response" | "invalid_json" | "api_error" | "blocked";

/** A failure safe to store as a document's `reason`: it never contains model or file content. */
export class ModelError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ModelError";
  }
}

export interface GeminiEnv {
  GEMINI_API_KEY?: string;
  GEMINI_PRO_MODEL?: string;
  GEMINI_FLASH_MODEL?: string;
}

// Versioned aliases that track the current Pro and Flash releases, so the ids do not go stale
// (docs/analysis.md: "pick current model versions at build time"). Override per environment.
export const DEFAULT_MODELS: Record<ModelTier, string> = {
  pro: "gemini-pro-latest",
  flash: "gemini-flash-latest",
};

export function modelIds(env: GeminiEnv = process.env): Record<ModelTier, string> {
  return {
    pro: env.GEMINI_PRO_MODEL || DEFAULT_MODELS.pro,
    flash: env.GEMINI_FLASH_MODEL || DEFAULT_MODELS.flash,
  };
}

export function createGeminiModel(env: GeminiEnv = process.env): JsonModel & ToolModel {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set (worker/.env locally, Secret Manager on Cloud Run)");
  }
  const ai = new GoogleGenAI({ apiKey });
  const ids = modelIds(env);

  return {
    async generateJson(request) {
      const parts: Part[] = [
        ...(request.files ?? []).map((file) =>
          createPartFromBase64(Buffer.from(file.bytes).toString("base64"), file.mimeType),
        ),
        { text: request.prompt },
      ];
      let text: string | undefined;
      try {
        const response = await ai.models.generateContent({
          model: ids[request.tier],
          contents: [createUserContent(parts)],
          config: {
            systemInstruction: request.systemInstruction,
            responseMimeType: "application/json",
            responseJsonSchema: request.responseJsonSchema,
            temperature: request.temperature ?? 0,
          },
        });
        if (response.promptFeedback?.blockReason) {
          throw new ModelError(
            "blocked",
            `Request blocked: ${response.promptFeedback.blockReason}`,
          );
        }
        text = response.text;
      } catch (error) {
        if (error instanceof ModelError) throw error;
        throw new ModelError("api_error", describeApiError(error), error);
      }
      if (!text) throw new ModelError("empty_response", "The model returned no content");
      try {
        return JSON.parse(text) as unknown;
      } catch (error) {
        throw new ModelError("invalid_json", "The model returned malformed JSON", error);
      }
    },

    async step(request) {
      try {
        const response = await ai.models.generateContent({
          model: ids[request.tier],
          contents: request.history,
          config: {
            systemInstruction: request.systemInstruction,
            tools: [{ functionDeclarations: request.tools }],
            temperature: request.temperature ?? 0,
          },
        });
        if (response.promptFeedback?.blockReason) {
          throw new ModelError(
            "blocked",
            `Request blocked: ${response.promptFeedback.blockReason}`,
          );
        }
        const content = response.candidates?.[0]?.content;
        if (!content) throw new ModelError("empty_response", "The model returned no content");
        const text = response.text;
        return {
          content,
          functionCalls: (response.functionCalls ?? []).map(toToolCall),
          ...(text ? { text } : {}),
        };
      } catch (error) {
        if (error instanceof ModelError) throw error;
        throw new ModelError("api_error", describeApiError(error), error);
      }
    },
  };
}

function toToolCall(call: FunctionCall): ToolCall {
  return {
    ...(call.id ? { id: call.id } : {}),
    name: call.name ?? "",
    args: call.args ?? {},
  };
}

function describeApiError(error: unknown): string {
  // Keep the status and a short message; never include request content.
  if (error && typeof error === "object") {
    const status = (error as { status?: unknown }).status;
    const message = (error as { message?: unknown }).message;
    const head = typeof message === "string" ? message.split("\n")[0]?.slice(0, 160) : undefined;
    return `Gemini API error${status ? ` ${status}` : ""}${head ? `: ${head}` : ""}`;
  }
  return "Gemini API error";
}
