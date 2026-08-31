/**
 * AI Provider Abstraction — defines the interface for AI providers
 * and implements the Gemini provider.
 *
 * Gemini is isolated behind this interface so it can be swapped for
 * OpenAI, Claude, or any future provider without rewriting ORS.
 */

import {
  GEMINI_API_KEY,
  GEMINI_MODEL,
  AI_TIMEOUT_MS,
  AI_ERROR_CODES,
} from "./config";

// ─── Types ────────────────────────────────────────────────────────

export type AiProviderName = "gemini" | "openai" | "anthropic";

export interface AiStructuredPrompt {
  /** System-level instructions for the AI. */
  systemInstruction: string;
  /** The user content (CV text, vacancy text, etc.). */
  userContent: string;
  /** Expected response schema for JSON mode. */
  responseSchema?: Record<string, unknown>;
}

export interface AiProviderResponse {
  success: boolean;
  /** Parsed JSON output when responseSchema was provided. */
  data?: unknown;
  /** Raw text response. */
  text?: string;
  /** Error details on failure. */
  error?: {
    code: string;
    message: string;
    httpStatus?: number;
    retryable: boolean;
  };
}

export interface AiProvider {
  readonly name: AiProviderName;

  /** Send a structured prompt to the provider. */
  generate(structured: AiStructuredPrompt): Promise<AiProviderResponse>;

  /** Quick health check — returns true if the provider is responsive. */
  healthCheck(): Promise<boolean>;
}

// ─── Gemini Provider ──────────────────────────────────────────────

class GeminiProvider implements AiProvider {
  readonly name: AiProviderName = "gemini";

  async generate(prompt: AiStructuredPrompt): Promise<AiProviderResponse> {
    if (!GEMINI_API_KEY) {
      return {
        success: false,
        error: {
          code: AI_ERROR_CODES.GEMINI_UNAVAILABLE,
          message: "GEMINI_API_KEY is not configured",
          retryable: false,
        },
      };
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

      const body: Record<string, unknown> = {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt.userContent }],
          },
        ],
        systemInstruction: {
          parts: [{ text: prompt.systemInstruction }],
        },
        generationConfig: {
          temperature: 0.1,
          topP: 0.8,
          topK: 40,
        },
      };

      // JSON mode when a schema is provided
      if (prompt.responseSchema) {
        const gc = body["generationConfig"] as Record<string, unknown>;
        gc["responseMimeType"] = "application/json";
        gc["responseSchema"] = prompt.responseSchema;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        return {
          success: false,
          error: {
            code: AI_ERROR_CODES.GEMINI_RATE_LIMITED,
            message: "Gemini rate limit exceeded",
            httpStatus: 429,
            retryable: true,
          },
        };
      }

      if (response.status === 403) {
        return {
          success: false,
          error: {
            code: AI_ERROR_CODES.GEMINI_QUOTA_EXHAUSTED,
            message: "Gemini quota/credits exhausted",
            httpStatus: 403,
            retryable: false,
          },
        };
      }

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        return {
          success: false,
          error: {
            code: AI_ERROR_CODES.GEMINI_UNAVAILABLE,
            message: `Gemini HTTP ${response.status}: ${bodyText.slice(0, 200)}`,
            httpStatus: response.status,
            retryable: response.status >= 500,
          },
        };
      }

      const json = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
          finishReason?: string;
        }>;
        promptFeedback?: { blockReason?: string };
      };

      // Check for safety blocks
      if (json.promptFeedback?.blockReason) {
        return {
          success: false,
          error: {
            code: AI_ERROR_CODES.INVALID_RESPONSE,
            message: `Gemini blocked response: ${json.promptFeedback.blockReason}`,
            retryable: false,
          },
        };
      }

      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        return {
          success: false,
          error: {
            code: AI_ERROR_CODES.INVALID_RESPONSE,
            message: "Gemini returned empty response",
            retryable: true,
          },
        };
      }

      // Parse JSON if schema was provided
      let data: unknown;
      if (prompt.responseSchema) {
        try {
          data = JSON.parse(text);
        } catch {
          return {
            success: false,
            error: {
              code: AI_ERROR_CODES.INVALID_RESPONSE,
              message: "Gemini returned invalid JSON",
              retryable: true,
            },
            text,
          };
        }
      }

      return { success: true, data, text };
    } catch (err: unknown) {
      const isAbort =
        err instanceof DOMException && err.name === "AbortError";
      return {
        success: false,
        error: {
          code: isAbort
            ? AI_ERROR_CODES.GEMINI_TIMEOUT
            : AI_ERROR_CODES.GEMINI_UNAVAILABLE,
          message: isAbort ? "Gemini request timed out" : String(err),
          retryable: true,
        },
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!GEMINI_API_KEY) return false;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ─── Provider Registry ────────────────────────────────────────────

const providers = new Map<AiProviderName, AiProvider>();

function getOrCreateProvider(name: AiProviderName): AiProvider {
  let provider = providers.get(name);
  if (!provider) {
    switch (name) {
      case "gemini":
        provider = new GeminiProvider();
        break;
      default:
        throw new Error(`Unknown AI provider: ${name}`);
    }
    providers.set(name, provider);
  }
  return provider;
}

/** Get the configured AI provider. */
export function getAiProvider(name?: AiProviderName): AiProvider {
  return getOrCreateProvider(name ?? "gemini");
}
