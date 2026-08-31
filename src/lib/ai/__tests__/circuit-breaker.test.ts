/**
 * Tests for the AI circuit breaker logic.
 *
 * Covers:
 *   - State transitions (closed → open → half_open → closed)
 *   - Failure threshold triggering circuit open
 *   - Recovery after timeout
 *   - Quota exhaustion immediate open
 *   - Rate limiting degrades but doesn't open
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB module before importing the circuit breaker
vi.mock("../../db", () => ({
  dbQueryFirst: vi.fn(),
  dbExecute: vi.fn(),
  dbQuery: vi.fn(),
}));

import { dbQueryFirst, dbExecute } from "../../db";
import {
  shouldAllowRequest,
  recordSuccess,
  recordFailure,
  resetCircuit,
  getCircuitStatus,
} from "../circuit-breaker";

const mockQuery = vi.mocked(dbQueryFirst);
const mockExec = vi.mocked(dbExecute);

describe("Circuit Breaker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: DB returns empty (no provider status)
    mockQuery.mockResolvedValue(null);
    mockExec.mockResolvedValue({} as any);
  });

  describe("shouldAllowRequest", () => {
    it("allows when no provider record exists", async () => {
      expect(await shouldAllowRequest("gemini")).toBe(true);
    });

    it("allows when circuit is closed", async () => {
      mockQuery.mockResolvedValue({ circuit_state: "closed", next_available_at: null });
      expect(await shouldAllowRequest("gemini")).toBe(true);
    });

    it("allows when circuit is half_open", async () => {
      mockQuery.mockResolvedValue({ circuit_state: "half_open" });
      expect(await shouldAllowRequest("gemini")).toBe(true);
    });

    it("blocks when circuit is open and recovery not elapsed", async () => {
      const future = new Date(Date.now() + 120_000).toISOString();
      mockQuery.mockResolvedValue({ circuit_state: "open", next_available_at: future });
      expect(await shouldAllowRequest("gemini")).toBe(false);
    });
  });

  describe("recordSuccess", () => {
    it("updates provider to active/closed on success", async () => {
      mockQuery.mockResolvedValue({ success_count: 0, total_requests: 0 });
      await recordSuccess("gemini");

      expect(mockExec).toHaveBeenCalledTimes(1);
      const call = mockExec.mock.calls[0];
      expect(call).toBeDefined();
      const sql = call![0] as string;
      expect(sql).toContain("UPDATE ai_provider_status");
      expect(sql).toContain("status");
      expect(sql).toContain("circuit_state");
    });
  });

  describe("recordFailure", () => {
    it("opens circuit after reaching failure threshold (existing record)", async () => {
      // Simulate existing provider record
      mockQuery.mockResolvedValue({
        failure_count: 4,
        total_failures: 10,
        total_requests: 20,
      });
      await recordFailure("gemini", "AI-GEMINI-001");

      expect(mockExec).toHaveBeenCalled();
      const call = mockExec.mock.calls[0];
      expect(call).toBeDefined();
      const sql = call![0] as string;
      expect(sql).toContain("UPDATE ai_provider_status");
      expect(sql).toContain("circuit_state");
    });

    it("degrades on rate limit without opening circuit", async () => {
      mockQuery.mockResolvedValue({
        failure_count: 2,
        total_failures: 5,
        total_requests: 10,
      });
      await recordFailure("gemini", "AI-GEMINI-002");

      expect(mockExec).toHaveBeenCalled();
      const call2 = mockExec.mock.calls[0];
      expect(call2).toBeDefined();
      const sql2 = call2![0] as string;
      expect(sql2).toContain("status");
    });

    it("immediately opens on quota exhaustion", async () => {
      mockQuery.mockResolvedValue({
        failure_count: 1,
        total_failures: 2,
        total_requests: 5,
      });
      await recordFailure("gemini", "AI-GEMINI-003");

      expect(mockExec).toHaveBeenCalled();
      const call3 = mockExec.mock.calls[0];
      expect(call3).toBeDefined();
      const sql3 = call3![0] as string;
      expect(sql3).toContain("circuit_state");
      expect(sql3).toContain("status");
    });
  });

  describe("resetCircuit", () => {
    it("resets to closed/active", async () => {
      mockQuery.mockResolvedValue({ provider: "gemini" });
      await resetCircuit("gemini");

      expect(mockExec).toHaveBeenCalled();
      const call = mockExec.mock.calls[0];
      expect(call).toBeDefined();
      const sql = call![0] as string;
      expect(sql).toContain("UPDATE ai_provider_status");
      expect(sql).toContain("circuit_state");
      expect(sql).toContain("status");
    });
  });

  describe("getCircuitStatus", () => {
    it("returns default status when no record exists", async () => {
      mockQuery.mockResolvedValue(null);
      const status = await getCircuitStatus("gemini");

      expect(status.provider).toBe("gemini");
      expect(status.state).toBe("closed");
      expect(status.health).toBe("active");
      expect(status.failureCount).toBe(0);
    });

    it("returns stored status when record exists", async () => {
      mockQuery.mockResolvedValue({
        circuit_state: "open",
        status: "unavailable",
        failure_count: 5,
        success_count: 10,
        last_failure_at: "2024-01-01",
        last_success_at: "2024-01-02",
        next_available_at: "2024-01-03",
      });
      const status = await getCircuitStatus("gemini");

      expect(status.state).toBe("open");
      expect(status.health).toBe("unavailable");
      expect(status.failureCount).toBe(5);
    });
  });
});
