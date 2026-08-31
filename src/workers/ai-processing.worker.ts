/**
 * AI Processing Worker — background worker that processes AI jobs
 * from the queue. Handles Gemini requests with retry, watchdog, and fallback.
 *
 * Architecture:
 *   Queue → Worker → Gemini → Validate → Normalize → Store → Score
 *                                  ↓
 *                           Retry / Fallback
 */

import { createWorker } from "@/lib/queue";
import { AI_QUEUE_NAME, AI_WATCHDOG_STUCK_THRESHOLD_SEC } from "@/lib/ai/config";
import { processAiCvJob } from "@/lib/ai/service";
import { updateAiJob, logAiEvent } from "@/lib/ai/logging";

// ─── Worker ───────────────────────────────────────────────────────

const aiWorker = createWorker(
  AI_QUEUE_NAME,
  async (job: { data: any; name: string }) => {
    const {
      jobId,
      tenantId,
      applicationId,
      candidateId,
      pdfText,
      documentHash,
      jobTitle,
      requiredSkills,
    } = job.data;

    console.log(`[AI Worker] Processing job ${jobId} for application ${applicationId}`);

    const result = await processAiCvJob({
      jobId,
      tenantId,
      applicationId,
      candidateId,
      pdfText,
      documentHash,
      jobTitle,
      requiredSkills,
    });

    if (result.fallbackUsed) {
      console.log(`[AI Worker] Job ${jobId} completed via fallback`);
    } else if (result.success) {
      console.log(`[AI Worker] Job ${jobId} completed successfully with AI`);
    } else {
      console.error(`[AI Worker] Job ${jobId} failed`);
      throw new Error(`AI processing failed for job ${jobId}`);
    }

    return result;
  },
);

// ─── Event Handlers ───────────────────────────────────────────────

aiWorker.on("completed", (job) => {
  console.log(`[AI Worker] Completed: ${job.id}`);
});

aiWorker.on("failed", (job, err) => {
  console.error(`[AI Worker] Failed: ${job?.id}`, err);
});

// ─── Watchdog ─────────────────────────────────────────────────────

/**
 * Watchdog that runs periodically to detect and recover stuck jobs.
 * Can be imported and called by a cron-like scheduler.
 */
export async function runWatchdog(): Promise<{
  recovered: number;
  retried: number;
}> {
  const { findStuckJobs, findRetryableJobs } = await import("@/lib/ai/logging");
  const { createQueue } = await import("@/lib/queue");

  let recovered = 0;
  let retried = 0;

  // 1. Find stuck jobs (PROCESSING for too long)
  const stuckJobs = await findStuckJobs(AI_WATCHDOG_STUCK_THRESHOLD_SEC);
  for (const stuck of stuckJobs) {
    console.warn(
      `[AI Watchdog] Recovering stuck job ${stuck.id} (stuck since ${stuck.started_at})`,
    );

    await updateAiJob(stuck.id, {
      status: "retry_scheduled",
      lastError: `Job stuck in PROCESSING for >${AI_WATCHDOG_STUCK_THRESHOLD_SEC}s`,
      errorCode: "AI-QUEUE-002",
      nextRetryAt: new Date().toISOString(), // Retry immediately
    });

    await logAiEvent({
      jobId: stuck.id,
      tenantId: stuck.tenant_id,
      eventType: "retry",
      errorCode: "AI-QUEUE-002",
      errorMessage: `Watchdog: stuck job recovered`,
    });

    recovered++;
  }

  // 2. Find retryable jobs (RETRY_SCHEDULED with next_retry_at passed)
  const retryableJobs = await findRetryableJobs();
  const queue = createQueue(AI_QUEUE_NAME);

  for (const retryable of retryableJobs) {
    console.log(
      `[AI Watchdog] Re-queuing retryable job ${retryable.id} (attempt ${retryable.attempts + 1}/${retryable.max_attempts})`,
    );

    // Re-enqueue the job
    // Note: We need the original job data — for now we'll trigger via the job record
    // In production, store the full job payload for retry
    await updateAiJob(retryable.id, { status: "queued" });

    retried++;
  }

  if (recovered > 0 || retried > 0) {
    console.log(
      `[AI Watchdog] Recovered ${recovered} stuck jobs, re-queued ${retried} retryable jobs`,
    );
  }

  return { recovered, retried };
}

export default aiWorker;
