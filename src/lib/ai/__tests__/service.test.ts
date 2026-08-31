/**
 * Tests for the AI service layer — feature flags, config, and error codes.
 *
 * Note: Full integration tests (requestAiCvProcessing with queue + worker)
 * require Redis and are better suited for integration test environments.
 * These tests verify the pure-logic portions of the service.
 */

import { describe, it, expect } from "vitest";

describe("AI Configuration", () => {
  it("should have all required error codes", async () => {
    const { AI_ERROR_CODES } = await import("../config");

    expect(AI_ERROR_CODES.PDF_EXTRACTION_FAILED).toBe("AI-PDF-001");
    expect(AI_ERROR_CODES.NO_USABLE_TEXT).toBe("AI-PDF-002");
    expect(AI_ERROR_CODES.GEMINI_TIMEOUT).toBe("AI-GEMINI-001");
    expect(AI_ERROR_CODES.GEMINI_RATE_LIMITED).toBe("AI-GEMINI-002");
    expect(AI_ERROR_CODES.GEMINI_QUOTA_EXHAUSTED).toBe("AI-GEMINI-003");
    expect(AI_ERROR_CODES.INVALID_RESPONSE).toBe("AI-GEMINI-004");
    expect(AI_ERROR_CODES.GEMINI_UNAVAILABLE).toBe("AI-GEMINI-005");
    expect(AI_ERROR_CODES.QUEUE_FAILURE).toBe("AI-QUEUE-001");
    expect(AI_ERROR_CODES.JOB_STUCK).toBe("AI-QUEUE-002");
    expect(AI_ERROR_CODES.FALLBACK_ACTIVATED).toBe("AI-FALLBACK-001");
  });

  it("should have sensible defaults for queue settings", async () => {
    const config = await import("../config");

    expect(config.AI_REQUEST_INTERVAL_MS).toBeGreaterThan(0);
    expect(config.AI_MAX_RETRIES).toBeGreaterThan(0);
    expect(config.AI_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it("should have circuit breaker thresholds configured", async () => {
    const config = await import("../config");

    expect(config.AI_CIRCUIT_FAILURE_THRESHOLD).toBeGreaterThan(0);
    expect(config.AI_CIRCUIT_RECOVERY_MS).toBeGreaterThan(0);
  });
});

describe("AI Queue Names", () => {
  it("should define the AI processing queue", async () => {
    const { AI_QUEUE_NAME } = await import("../config");
    expect(AI_QUEUE_NAME).toBe("ai-processing");
  });
});
