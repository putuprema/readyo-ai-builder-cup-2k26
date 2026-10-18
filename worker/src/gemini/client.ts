import { createPartFromBase64, createUserContent, GoogleGenAI, type Part } from "@google/genai";

// The one place the worker talks to Gemini. Every call asks for structured JSON against a
// response schema; callers validate the result with zod. Tests pass a fake `JsonModel`.

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

export function createGeminiModel(env: GeminiEnv = process.env): JsonModel {
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
