import { GoogleGenAI, type GroundingMetadata } from "@google/genai";

// The one place the api talks to Gemini (stage 1, goal pricing). Same shape as the worker's
// client: structured JSON against a response schema, injectable for offline tests. The one
// difference is Google Search grounding: the call can turn the search tool on and the result
// carries the grounding metadata (queries run, pages used) next to the parsed JSON.

export type ModelTier = "pro" | "flash";

export interface JsonRequest {
  tier: ModelTier;
  systemInstruction: string;
  prompt: string;
  responseJsonSchema: Record<string, unknown>;
  temperature?: number;
  /** Turn Google Search grounding on for this call. */
  googleSearch?: boolean;
}

export interface GroundingSource {
  title?: string;
  uri?: string;
}

export interface Grounding {
  /** The web searches the model ran. Empty when it did not search. */
  queries: string[];
  /** The pages the answer was grounded on. */
  sources: GroundingSource[];
}

export interface JsonResult {
  /** The parsed JSON the model produced. */
  json: unknown;
  grounding: Grounding;
}

export interface JsonModel {
  /** Returns the parsed JSON and the grounding metadata; throws ModelError on failure. */
  generateJson(request: JsonRequest): Promise<JsonResult>;
}

export type ModelErrorCode = "empty_response" | "invalid_json" | "api_error" | "blocked";

/** A failure safe to show or log: it never contains model content. */
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

// Versioned aliases that track the current Pro and Flash releases (same as the worker).
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

export function hasGeminiKey(env: GeminiEnv = process.env): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

export function createGeminiModel(env: GeminiEnv = process.env): JsonModel {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set (api/.env locally, Secret Manager on Cloud Run)");
  }
  const ai = new GoogleGenAI({ apiKey });
  const ids = modelIds(env);

  return {
    async generateJson(request) {
      let text: string | undefined;
      let grounding: Grounding = { queries: [], sources: [] };
      try {
        const response = await ai.models.generateContent({
          model: ids[request.tier],
          contents: request.prompt,
          config: {
            systemInstruction: request.systemInstruction,
            responseMimeType: "application/json",
            responseJsonSchema: request.responseJsonSchema,
            temperature: request.temperature ?? 0,
            tools: request.googleSearch ? [{ googleSearch: {} }] : undefined,
          },
        });
        if (response.promptFeedback?.blockReason) {
          throw new ModelError(
            "blocked",
            `Request blocked: ${response.promptFeedback.blockReason}`,
          );
        }
        text = response.text;
        grounding = groundingOf(response.candidates?.[0]?.groundingMetadata);
      } catch (error) {
        if (error instanceof ModelError) throw error;
        throw new ModelError("api_error", describeApiError(error), error);
      }
      if (!text) throw new ModelError("empty_response", "The model returned no content");
      try {
        return { json: JSON.parse(text) as unknown, grounding };
      } catch (error) {
        throw new ModelError("invalid_json", "The model returned malformed JSON", error);
      }
    },
  };
}

/** The parts of the grounding metadata the pricing stage reads. Exported for tests. */
export function groundingOf(metadata: GroundingMetadata | undefined): Grounding {
  return {
    queries: metadata?.webSearchQueries ?? [],
    sources: (metadata?.groundingChunks ?? [])
      .map((chunk) => chunk.web)
      .filter((web): web is NonNullable<typeof web> => Boolean(web))
      .map((web) => ({ title: web.title, uri: web.uri })),
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
