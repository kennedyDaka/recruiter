/**
 * AI Configuration — centralized settings for the AI integration layer.
 *
 * All AI-related configuration is read from environment variables here.
 * Feature flags control whether AI is active; if disabled, ORS falls back
 * to its existing processing path with zero degradation.
 */

// ─── Feature Flags ────────────────────────────────────────────────

export const AI_ENABLED = process.env["AI_ENABLED"] === "true";
export const AI_VACANCY_ASSISTANT = process.env["AI_VACANCY_ASSISTANT"] === "true";
export const AI_CV_PROCESSING = process.env["AI_CV_PROCESSING"] === "true";
export const AI_FALLBACK_ENABLED = process.env["AI_FALLBACK_ENABLED"] !== "false"; // Default: true
export const AI_CIRCUIT_BREAKER_ENABLED = process.env["AI_CIRCUIT_BREAKER_ENABLED"] !== "false"; // Default: true
export const AI_WATCHDOG_ENABLED = process.env["AI_WATCHDOG_ENABLED"] !== "false"; // Default: true

// ─── Provider Settings ────────────────────────────────────────────

export const AI_PROVIDER = process.env["AI_PROVIDER"] || "gemini";
export const GEMINI_API_KEY = process.env["GEMINI_API_KEY"] || "";
export const GEMINI_MODEL = process.env["GEMINI_MODEL"] || "gemini-3.5-flash-lite";

// ─── Queue Settings ───────────────────────────────────────────────

/** Milliseconds between AI requests — initial 10-second spacing. */
export const AI_REQUEST_INTERVAL_MS = parseInt(
  process.env["AI_REQUEST_INTERVAL_MS"] || "10000",
  10,
);

/** Maximum retry attempts before fallback. */
export const AI_MAX_RETRIES = parseInt(
  process.env["AI_MAX_RETRIES"] || "3",
  10,
);

/** Request timeout in milliseconds. */
export const AI_TIMEOUT_MS = parseInt(
  process.env["AI_TIMEOUT_MS"] || "30000",
  10,
);

// ─── Circuit Breaker Settings ─────────────────────────────────────

/** Number of consecutive failures before circuit opens. */
export const AI_CIRCUIT_FAILURE_THRESHOLD = parseInt(
  process.env["AI_CIRCUIT_FAILURE_THRESHOLD"] || "5",
  10,
);

/** Milliseconds to wait before trying a half-open probe. */
export const AI_CIRCUIT_RECOVERY_MS = parseInt(
  process.env["AI_CIRCUIT_RECOVERY_MS"] || "60000",
  10,
);

// ─── Watchdog Settings ────────────────────────────────────────────

/** Maximum seconds a job can stay in PROCESSING before watchdog intervenes. */
export const AI_WATCHDOG_STUCK_THRESHOLD_SEC = parseInt(
  process.env["AI_WATCHDOG_STUCK_THRESHOLD_SEC"] || "120",
  10,
);

/** How often the watchdog runs (seconds). */
export const AI_WATCHDOG_INTERVAL_SEC = parseInt(
  process.env["AI_WATCHDOG_INTERVAL_SEC"] || "30",
  10,
);

// ─── PDF Extraction ───────────────────────────────────────────────

/** Maximum characters to send to Gemini from extracted PDF text. */
export const AI_MAX_INPUT_CHARS = parseInt(
  process.env["AI_MAX_INPUT_CHARS"] || "50000",
  10,
);

/** Minimum usable text length after extraction. */
export const AI_MIN_TEXT_LENGTH = parseInt(
  process.env["AI_MIN_TEXT_LENGTH"] || "50",
  10,
);

// ─── Error Codes ──────────────────────────────────────────────────

export const AI_ERROR_CODES = {
  PDF_EXTRACTION_FAILED: "AI-PDF-001",
  NO_USABLE_TEXT: "AI-PDF-002",
  GEMINI_TIMEOUT: "AI-GEMINI-001",
  GEMINI_RATE_LIMITED: "AI-GEMINI-002",
  GEMINI_QUOTA_EXHAUSTED: "AI-GEMINI-003",
  INVALID_RESPONSE: "AI-GEMINI-004",
  GEMINI_UNAVAILABLE: "AI-GEMINI-005",
  QUEUE_FAILURE: "AI-QUEUE-001",
  JOB_STUCK: "AI-QUEUE-002",
  FALLBACK_ACTIVATED: "AI-FALLBACK-001",
} as const;

/** Standardized error codes union type. */
export type AiErrorCode =
  (typeof AI_ERROR_CODES)[keyof typeof AI_ERROR_CODES];

// ─── Queue Name ───────────────────────────────────────────────────

export const AI_QUEUE_NAME = "ai-processing";
