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
