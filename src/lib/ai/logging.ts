/**
 * AI Monitoring & Logging — records every AI processing event for
 * diagnostics, auditing, and the admin monitoring dashboard.
 */

import { dbExecute, dbQuery, dbQueryFirst } from "../db";

// ─── Types ────────────────────────────────────────────────────────

export type AiEventType =
  | "queued"
  | "started"
  | "attempt"
  | "success"
  | "validation_failed"
  | "retry"
  | "fallback_started"
  | "fallback_completed"
  | "rate_limited"
  | "timeout"
  | "error";

export interface AiEventLog {
  jobId: string;
  tenantId: string;
  eventType: AiEventType;
  attemptNumber?: number;
  provider?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  httpStatus?: number;
  durationMs?: number;
}

export interface AiHealthDashboard {
  provider: string;
  status: string;
  circuitState: string;
  queueWaiting: number;
  processedTotal: number;
  aiSuccessful: number;
  fallbackCount: number;
  fallbackRate: string;
  failed: number;
  requestInterval: number;
  avgResponseMs: number;
}

// ─── Job Lifecycle ────────────────────────────────────────────────

/**
 * Create a new AI job record.
 */
export async function createAiJob(params: {
  tenantId: string;
  applicationId?: string;
  candidateId?: string;
  documentId?: string;
  jobType?: string;
  inputHash?: string;
  inputSummary?: string;
  priority?: number;
  maxAttempts?: number;
}): Promise<string | null> {
  try {
    const id = crypto.randomUUID();
    await dbExecute(
      `INSERT INTO ai_jobs (id, tenant_id, application_id, candidate_id, document_id, job_type, status, input_hash, input_summary, priority, max_attempts)
       VALUES ($1, $2, $3, $4, $5, $6, 'created', $7, $8, $9, $10)`,
      [
        id,
        params.tenantId,
        params.applicationId ?? null,
        params.candidateId ?? null,
        params.documentId ?? null,
        params.jobType ?? "cv_processing",
        params.inputHash ?? null,
        params.inputSummary ?? null,
        params.priority ?? 0,
        params.maxAttempts ?? 3,
      ],
    );
    return id;
  } catch (err) {
    console.error("[AI Logging] Failed to create job:", err);
    return null;
  }
}

/**
 * Update an AI job's status.
 */
export async function updateAiJob(
  jobId: string,
  updates: {
    status?: string;
    queuedAt?: string;
    startedAt?: string;
    completedAt?: string;
    nextRetryAt?: string;
    attempts?: number;
    lastError?: string;
    errorCode?: string;
    rawResponse?: string;
    parsedOutput?: string;
    providerJobId?: string;
  },
): Promise<void> {
  try {
    const setParts: string[] = [];
    const args: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      // Convert camelCase to snake_case for SQL
      const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      setParts.push(`${snakeKey} = $${idx++}`);
      args.push(value);
    }

    if (setParts.length === 0) return;
    args.push(jobId);

    await dbExecute(
      `UPDATE ai_jobs SET ${setParts.join(", ")} WHERE id = $${idx}`,
      args,
    );
  } catch (err) {
    console.error("[AI Logging] Failed to update job:", err);
  }
}

// ─── Event Logging ────────────────────────────────────────────────

/**
 * Log an AI processing event.
 */
export async function logAiEvent(event: AiEventLog): Promise<void> {
  try {
    await dbExecute(
      `INSERT INTO ai_processing_logs (id, job_id, tenant_id, event_type, attempt_number, provider, status, error_code, error_message, http_status, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        crypto.randomUUID(),
        event.jobId,
        event.tenantId,
        event.eventType,
        event.attemptNumber ?? 1,
        event.provider ?? "gemini",
        event.status ?? null,
        event.errorCode ?? null,
        event.errorMessage ?? null,
        event.httpStatus ?? null,
        event.durationMs ?? null,
      ],
    );
  } catch (err) {
    console.error("[AI Logging] Failed to log event:", err);
  }
}

// ─── Deduplication ────────────────────────────────────────────────

/**
 * Check if a document hash has already been successfully processed.
 * Returns the existing result ID if found.
 */
export async function findExistingResult(
  documentHash: string,
): Promise<string | null> {
  try {
    const row = await dbQueryFirst(
      "SELECT result_id FROM ai_document_hashes WHERE document_hash = $1 AND result_id IS NOT NULL",
      [documentHash],
    );
    return row?.result_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Record a document hash for deduplication.
 */
export async function recordDocumentHash(params: {
  documentHash: string;
  tenantId: string;
  applicationId?: string;
  documentId?: string;
  fileName?: string;
  fileSize?: number;
  resultId?: string;
  provider?: string;
}): Promise<void> {
  try {
    await dbExecute(
      `INSERT INTO ai_document_hashes (id, document_hash, tenant_id, application_id, document_id, file_name, file_size, result_id, provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (document_hash) DO UPDATE SET result_id = COALESCE(EXCLUDED.result_id, ai_document_hashes.result_id)`,
      [
        crypto.randomUUID(),
        params.documentHash,
        params.tenantId,
        params.applicationId ?? null,
        params.documentId ?? null,
        params.fileName ?? null,
        params.fileSize ?? null,
        params.resultId ?? null,
        params.provider ?? "gemini",
      ],
    );
  } catch (err) {
    console.error("[AI Logging] Failed to record document hash:", err);
  }
}

// ─── Watchdog ─────────────────────────────────────────────────────

/**
 * Find jobs that are stuck in PROCESSING state beyond the threshold.
 */
export async function findStuckJobs(
  thresholdSeconds: number,
): Promise<Array<{ id: string; tenant_id: string; started_at: string }>> {
  try {
    return await dbQuery(
      `SELECT id, tenant_id, started_at FROM ai_jobs
       WHERE status = 'processing'
       AND started_at < NOW() - INTERVAL '1 second' * $1
       LIMIT 50`,
      [thresholdSeconds],
    ) as any[];
  } catch {
    return [];
  }
}

/**
 * Find jobs ready for retry (next_retry_at has passed).
 */
export async function findRetryableJobs(): Promise<
  Array<{ id: string; tenant_id: string; attempts: number; max_attempts: number }>
> {
  try {
    return await dbQuery(
      `SELECT id, tenant_id, attempts, max_attempts FROM ai_jobs
       WHERE status = 'retry_scheduled'
       AND next_retry_at <= NOW()
       AND attempts < max_attempts
       ORDER BY priority DESC, created_at ASC
       LIMIT 10`,
      [],
    ) as any[];
  } catch {
    return [];
  }
}

// ─── Dashboard Stats ──────────────────────────────────────────────

/**
 * Get AI system health dashboard data for the admin panel.
 */
export async function getAiHealthDashboard(
  provider = "gemini",
): Promise<AiHealthDashboard> {
  try {
    // Provider status
    const providerStatus = await dbQueryFirst(
      "SELECT * FROM ai_provider_status WHERE provider = $1",
      [provider],
    );

    // Queue stats
    const queueStats = await dbQueryFirst(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'queued') as waiting,
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'completed') as successful,
         COUNT(*) FILTER (WHERE status = 'fallback_completed') as fallback,
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         AVG(CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000
             END) as avg_ms
       FROM ai_jobs`,
      [],
    );

    const total = Number(queueStats?.total ?? 0);
    const fallback = Number(queueStats?.fallback ?? 0);

    return {
      provider,
      status: providerStatus?.status ?? "unknown",
      circuitState: providerStatus?.circuit_state ?? "unknown",
      queueWaiting: Number(queueStats?.waiting ?? 0),
      processedTotal: total,
      aiSuccessful: Number(queueStats?.successful ?? 0),
      fallbackCount: fallback,
      fallbackRate: total > 0 ? `${((fallback / total) * 100).toFixed(1)}%` : "0%",
      failed: Number(queueStats?.failed ?? 0),
      requestInterval: Number(process.env["AI_REQUEST_INTERVAL_MS"] ?? 10000),
      avgResponseMs: Math.round(Number(queueStats?.avg_ms ?? 0)),
    };
  } catch {
    return {
      provider,
      status: "unknown",
      circuitState: "unknown",
      queueWaiting: 0,
      processedTotal: 0,
      aiSuccessful: 0,
      fallbackCount: 0,
      fallbackRate: "0%",
      failed: 0,
      requestInterval: 10000,
      avgResponseMs: 0,
    };
  }
}

/**
 * Get recent AI processing logs for a tenant.
 */
export async function getRecentLogs(
  tenantId: string,
  limit = 50,
): Promise<any[]> {
  try {
    return await dbQuery(
      `SELECT l.*, j.job_type, j.input_summary
       FROM ai_processing_logs l
       JOIN ai_jobs j ON l.job_id = j.id
       WHERE l.tenant_id = $1
       ORDER BY l.created_at DESC
       LIMIT $2`,
      [tenantId, limit],
    );
  } catch {
    return [];
  }
}

// ─── Comprehensive Metrics ────────────────────────────────────────

export interface AiMetrics {
  // Real-time queue state
  queue: {
    depth: number;           // Currently queued jobs
    processing: number;      // Currently being processed
    retryScheduled: number;  // Waiting for retry
  };
  // Throughput
  throughput: {
    last1h: number;
    last6h: number;
    last24h: number;
    last7d: number;
  };
  // Success/failure rates
  outcomes: {
    aiSuccess: number;
    fallbackCompleted: number;
    failed: number;
    totalAllTime: number;
    successRate: string;
    fallbackRate: string;
  };
  // Performance
  performance: {
    avgResponseMs: number;
    p50ResponseMs: number;
    p95ResponseMs: number;
    avgRetries: number;
  };
  // Per-tenant usage (top 10)
  tenantUsage: Array<{
    tenantId: string;
    tenantName: string;
    totalJobs: number;
    successful: number;
    failed: number;
  }>;
  // Currently processing jobs
  activeJobs: Array<{
    id: string;
    tenantId: string;
    applicationId: string | null;
    jobType: string;
    startedAt: string;
    elapsedSec: number;
  }>;
  // Hourly trend (last 24h)
  hourlyTrend: Array<{
    hour: string;
    total: number;
    successful: number;
    failed: number;
  }>;
  // Provider status
  provider: AiHealthDashboard;
}

/**
 * Get comprehensive AI metrics for the admin dashboard.
 * Combines queue state, throughput, trends, and per-tenant breakdown.
 */
export async function getAiMetrics(): Promise<AiMetrics> {
  try {
    const [
      queueState,
      throughput1h,
      throughput6h,
      throughput24h,
      throughput7d,
      outcomes,
      perfAvg,
      perfP50,
      perfP95,
      perfRetries,
      tenantUsage,
      activeJobs,
      hourlyTrend,
    ] = await Promise.all([
      // Queue state
      dbQueryFirst(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'queued') as depth,
          COUNT(*) FILTER (WHERE status = 'processing') as processing,
          COUNT(*) FILTER (WHERE status = 'retry_scheduled') as retry_scheduled
        FROM ai_jobs
      `),
      // Throughput
      dbQueryFirst(`SELECT COUNT(*) as count FROM ai_jobs WHERE created_at > NOW() - INTERVAL '1 hour'`),
      dbQueryFirst(`SELECT COUNT(*) as count FROM ai_jobs WHERE created_at > NOW() - INTERVAL '6 hours'`),
      dbQueryFirst(`SELECT COUNT(*) as count FROM ai_jobs WHERE created_at > NOW() - INTERVAL '24 hours'`),
      dbQueryFirst(`SELECT COUNT(*) as count FROM ai_jobs WHERE created_at > NOW() - INTERVAL '7 days'`),
      // Outcomes
      dbQueryFirst(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'completed') as ai_success,
          COUNT(*) FILTER (WHERE status = 'fallback_completed') as fallback_completed,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COUNT(*) as total
        FROM ai_jobs
      `),
      // Performance
      dbQueryFirst(`
        SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) as avg_ms
        FROM ai_jobs WHERE completed_at IS NOT NULL AND started_at IS NOT NULL
      `),
      dbQueryFirst(`
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) as p50
        FROM ai_jobs WHERE completed_at IS NOT NULL AND started_at IS NOT NULL
      `),
      dbQueryFirst(`
        SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) as p95
        FROM ai_jobs WHERE completed_at IS NOT NULL AND started_at IS NOT NULL
      `),
      dbQueryFirst(`SELECT AVG(attempts) as avg_retries FROM ai_jobs WHERE attempts > 0`),
      // Tenant usage (top 10)
      dbQuery(
        `SELECT j.tenant_id, t.name as tenant_name,
                COUNT(*) as total_jobs,
                COUNT(*) FILTER (WHERE j.status = 'completed') as successful,
                COUNT(*) FILTER (WHERE j.status = 'failed') as failed
         FROM ai_jobs j
         LEFT JOIN tenants t ON j.tenant_id = t.id
         GROUP BY j.tenant_id, t.name
         ORDER BY total_jobs DESC
         LIMIT 10`,
      ),
      // Currently active jobs
      dbQuery(
        `SELECT id, tenant_id, application_id, job_type, started_at,
                EXTRACT(EPOCH FROM (NOW() - started_at)) as elapsed_sec
         FROM ai_jobs
         WHERE status = 'processing'
         ORDER BY started_at ASC
         LIMIT 20`,
      ),
      // Hourly trend (last 24h)
      dbQuery(
        `SELECT
           date_trunc('hour', created_at) as hour,
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'completed') as successful,
           COUNT(*) FILTER (WHERE status = 'failed') as failed
         FROM ai_jobs
         WHERE created_at > NOW() - INTERVAL '24 hours'
         GROUP BY date_trunc('hour', created_at)
         ORDER BY hour ASC`,
      ),
    ]);

    const total = Number(outcomes?.total ?? 0);
    const aiSuccess = Number(outcomes?.ai_success ?? 0);
    const fallbackCompleted = Number(outcomes?.fallback_completed ?? 0);

    return {
      queue: {
        depth: Number(queueState?.depth ?? 0),
        processing: Number(queueState?.processing ?? 0),
        retryScheduled: Number(queueState?.retry_scheduled ?? 0),
      },
      throughput: {
        last1h: Number(throughput1h?.count ?? 0),
        last6h: Number(throughput6h?.count ?? 0),
        last24h: Number(throughput24h?.count ?? 0),
        last7d: Number(throughput7d?.count ?? 0),
      },
      outcomes: {
        aiSuccess,
        fallbackCompleted,
        failed: Number(outcomes?.failed ?? 0),
        totalAllTime: total,
        successRate: total > 0 ? `${((aiSuccess / total) * 100).toFixed(1)}%` : "0%",
        fallbackRate: total > 0 ? `${((fallbackCompleted / total) * 100).toFixed(1)}%` : "0%",
      },
      performance: {
        avgResponseMs: Math.round(Number(perfAvg?.avg_ms ?? 0)),
        p50ResponseMs: Math.round(Number(perfP50?.p50 ?? 0)),
        p95ResponseMs: Math.round(Number(perfP95?.p95 ?? 0)),
        avgRetries: Math.round(Number(perfRetries?.avg_retries ?? 0) * 10) / 10,
      },
      tenantUsage: (tenantUsage ?? []).map((t: any) => ({
        tenantId: t.tenant_id,
        tenantName: t.tenant_name ?? "Unknown",
        totalJobs: Number(t.total_jobs),
        successful: Number(t.successful),
        failed: Number(t.failed),
      })),
      activeJobs: (activeJobs ?? []).map((j: any) => ({
        id: j.id,
        tenantId: j.tenant_id,
        applicationId: j.application_id,
        jobType: j.job_type,
        startedAt: j.started_at,
        elapsedSec: Math.round(Number(j.elapsed_sec)),
      })),
      hourlyTrend: (hourlyTrend ?? []).map((h: any) => ({
        hour: h.hour,
        total: Number(h.total),
        successful: Number(h.successful),
        failed: Number(h.failed),
      })),
      provider: await getAiHealthDashboard("gemini"),
    };
  } catch (err) {
    console.error("[AI Metrics] Failed to fetch metrics:", err);
    return {
      queue: { depth: 0, processing: 0, retryScheduled: 0 },
      throughput: { last1h: 0, last6h: 0, last24h: 0, last7d: 0 },
      outcomes: { aiSuccess: 0, fallbackCompleted: 0, failed: 0, totalAllTime: 0, successRate: "0%", fallbackRate: "0%" },
      performance: { avgResponseMs: 0, p50ResponseMs: 0, p95ResponseMs: 0, avgRetries: 0 },
      tenantUsage: [],
      activeJobs: [],
      hourlyTrend: [],
      provider: await getAiHealthDashboard("gemini"),
    };
  }
}
