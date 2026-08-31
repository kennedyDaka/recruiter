/**
 * AI Circuit Breaker — prevents hammering an unavailable Gemini service.
 *
 * States:
 *   ACTIVE    — New CV → Gemini
 *   DEGRADED  — New CV → Gemini → Retry → Fallback
 *   UNAVAILABLE — New CV → Existing ORS Processor
 *
 * The circuit breaker automatically recovers via health checks.
 */

import {
  AI_CIRCUIT_BREAKER_ENABLED,
  AI_CIRCUIT_FAILURE_THRESHOLD,
  AI_CIRCUIT_RECOVERY_MS,
  AI_ERROR_CODES,
} from "./config";
import { dbQueryFirst, dbExecute, dbQuery } from "../db";

// ─── Types ────────────────────────────────────────────────────────

export type CircuitState = "closed" | "open" | "half_open";
export type ProviderHealth = "active" | "degraded" | "unavailable";

export interface CircuitBreakerStatus {
  provider: string;
  state: CircuitState;
  health: ProviderHealth;
  failureCount: number;
  successCount: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  nextAvailableAt: string | null;
}

// ─── In-Memory Cache (DB is source of truth) ─────────────────────

const cache = new Map<
  string,
  { state: CircuitState; failureCount: number; nextAvailableAt: number | null }
>();

// ─── Core Operations ──────────────────────────────────────────────

/**
 * Check if the AI provider should be used for a new request.
 * Returns true if requests are allowed (circuit closed or half-open).
 */
export async function shouldAllowRequest(
  provider = "gemini",
): Promise<boolean> {
  if (!AI_CIRCUIT_BREAKER_ENABLED) return true;

  const status = await getProviderStatus(provider);
  if (!status) return true;

  if (status.state === "closed") return true;

  if (status.state === "open") {
    // Check if recovery window has elapsed
    if (status.nextAvailableAt) {
      const nextAvailable = new Date(status.nextAvailableAt).getTime();
      if (Date.now() >= nextAvailable) {
        // Transition to half-open
        await updateProviderStatus(provider, {
          circuit_state: "half_open",
        });
        cache.set(provider, {
          state: "half_open",
          failureCount: status.failureCount,
          nextAvailableAt: null,
        });
        return true; // Allow one probe request
      }
    }
    return false;
  }

  // half_open: allow probe requests
  return true;
}

/**
 * Record a successful AI request. Resets the circuit breaker.
 */
export async function recordSuccess(
  provider = "gemini",
): Promise<void> {
  if (!AI_CIRCUIT_BREAKER_ENABLED) return;

  const status = await getProviderStatus(provider);
  const newSuccessCount = (status?.successCount ?? 0) + 1;

  await updateProviderStatus(provider, {
    status: "active",
    circuit_state: "closed",
    failure_count: 0,
    success_count: newSuccessCount,
    last_success_at: new Date().toISOString(),
    total_requests: (status?.totalRequests ?? 0) + 1,
  });

  cache.delete(provider);
}

/**
 * Record a failed AI request. Opens the circuit if threshold is exceeded.
 */
export async function recordFailure(
  provider = "gemini",
  errorCode?: string,
): Promise<void> {
  if (!AI_CIRCUIT_BREAKER_ENABLED) return;

  const status = await getProviderStatus(provider);
  const newFailureCount = (status?.failureCount ?? 0) + 1;
  const totalFailures = (status?.totalFailures ?? 0) + 1;
  const totalRequests = (status?.totalRequests ?? 0) + 1;

  // Quota exhaustion immediately marks as unavailable
  const isQuotaExhausted =
    errorCode === AI_ERROR_CODES.GEMINI_QUOTA_EXHAUSTED;
  // Rate limiting degrades but doesn't open the circuit
  const isRateLimited = errorCode === AI_ERROR_CODES.GEMINI_RATE_LIMITED;

  let newState: CircuitState = "closed";
  let newHealth: ProviderHealth = "active";

  if (isQuotaExhausted) {
    newState = "open";
    newHealth = "unavailable";
  } else if (isRateLimited) {
    newHealth = "degraded";
  } else if (newFailureCount >= AI_CIRCUIT_FAILURE_THRESHOLD) {
    newState = "open";
    newHealth = "unavailable";
  } else if (newFailureCount >= Math.ceil(AI_CIRCUIT_FAILURE_THRESHOLD / 2)) {
    newHealth = "degraded";
  }

  const nextAvailableAt =
    newState === "open"
      ? new Date(Date.now() + AI_CIRCUIT_RECOVERY_MS).toISOString()
      : null;

  await updateProviderStatus(provider, {
    status: newHealth,
    circuit_state: newState,
    failure_count: newFailureCount,
    total_failures: totalFailures,
    total_requests: totalRequests,
    last_failure_at: new Date().toISOString(),
    next_available_at: nextAvailableAt,
  });

  cache.set(provider, {
    state: newState,
    failureCount: newFailureCount,
    nextAvailableAt: nextAvailableAt
      ? new Date(nextAvailableAt).getTime()
      : null,
  });
}

/**
 * Get the current circuit breaker status for a provider.
 */
export async function getCircuitStatus(
  provider = "gemini",
): Promise<CircuitBreakerStatus> {
  const status = await getProviderStatus(provider);
  return {
    provider,
    state: (status?.circuit_state as CircuitState) ?? "closed",
    health: (status?.status as ProviderHealth) ?? "active",
    failureCount: status?.failure_count ?? 0,
    successCount: status?.success_count ?? 0,
    lastFailureAt: status?.last_failure_at ?? null,
    lastSuccessAt: status?.last_success_at ?? null,
    nextAvailableAt: status?.next_available_at ?? null,
  };
}

/**
 * Force-reset the circuit breaker (admin action).
 */
export async function resetCircuit(
  provider = "gemini",
): Promise<void> {
  await updateProviderStatus(provider, {
    status: "active",
    circuit_state: "closed",
    failure_count: 0,
    last_failure_at: null,
    next_available_at: null,
  });
  cache.delete(provider);
}

// ─── Health Check ─────────────────────────────────────────────────

/**
 * Background health check — runs periodically to detect provider recovery.
 * If the circuit is open and the provider responds, transitions to half-open
 * then closed on the next successful request.
 */
export async function runHealthCheck(
  providerName = "gemini",
): Promise<boolean> {
  const { getAiProvider } = await import("./provider");
  const provider = getAiProvider(providerName as any);
  const isHealthy = await provider.healthCheck();

  const status = await getProviderStatus(providerName);

  if (isHealthy && status?.circuit_state === "open") {
    await updateProviderStatus(providerName, {
      circuit_state: "half_open",
      last_health_check: new Date().toISOString(),
    });
    cache.delete(providerName);
  } else if (isHealthy) {
    await updateProviderStatus(providerName, {
      last_health_check: new Date().toISOString(),
    });
  } else {
    await updateProviderStatus(providerName, {
      last_health_check: new Date().toISOString(),
    });
  }

  return isHealthy;
}

// ─── DB Helpers ───────────────────────────────────────────────────

async function getProviderStatus(provider: string) {
  try {
    return await dbQueryFirst(
      "SELECT * FROM ai_provider_status WHERE provider = $1",
      [provider],
    );
  } catch {
    // Table may not exist yet
    return null;
  }
}

async function updateProviderStatus(
  provider: string,
  updates: Record<string, unknown>,
): Promise<void> {
  try {
    const existing = await getProviderStatus(provider);
    if (!existing) {
      // Insert new record
      const cols = ["provider", ...Object.keys(updates)];
      const vals = [provider, ...Object.values(updates)];
      const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
      await dbExecute(
        `INSERT INTO ai_provider_status (${cols.join(", ")}) VALUES (${ph})`,
        vals,
      );
    } else {
      // Update existing
      const setParts: string[] = [];
      const args: unknown[] = [];
      let idx = 1;
      for (const [key, value] of Object.entries(updates)) {
        setParts.push(`${key} = $${idx++}`);
        args.push(value);
      }
      args.push(provider);
      await dbExecute(
        `UPDATE ai_provider_status SET ${setParts.join(", ")} WHERE provider = $${idx}`,
        args,
      );
    }
  } catch {
    // If the table doesn't exist, fail silently — circuit breaker is best-effort
  }
}
