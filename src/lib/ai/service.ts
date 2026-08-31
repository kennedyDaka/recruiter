/**
 * AI Integration Service — the central orchestration layer between
 * Gemini and the existing ORS system.
 *
 * Responsibilities:
 *   - Receive processing requests
 *   - Check deduplication (document hash)
 *   - Check circuit breaker
 *   - Queue AI jobs
 *   - Process with Gemini
 *   - Validate output
 *   - Normalize to ORS format
 *   - Store results
 *   - Trigger scoring engine
 *   - Handle fallback to existing ORS processor
 *   - Record all activity
 */

import {
  AI_ENABLED,
  AI_CV_PROCESSING,
  AI_VACANCY_ASSISTANT,
  AI_FALLBACK_ENABLED,
  AI_REQUEST_INTERVAL_MS,
  AI_MAX_RETRIES,
  AI_ERROR_CODES,
} from "./config";
import { shouldAllowRequest, recordSuccess, recordFailure } from "./circuit-breaker";
import { extractPdfText, hashDocument } from "./pdf-extraction";
import { analyzeCv } from "./cv-analysis";
import { structureVacancy } from "./vacancy-structuring";
import { normalizeGeminiToScoringInput } from "./normalization";
import {
  createAiJob,
  updateAiJob,
  logAiEvent,
  findExistingResult,
  recordDocumentHash,
} from "./logging";
import { dbQueryFirst, dbExecute, dbQuery } from "../db";
import { createQueue } from "../queue";
import { AI_QUEUE_NAME } from "./config";

// ─── Types ────────────────────────────────────────────────────────

export interface AiCvProcessingRequest {
  tenantId: string;
  applicationId: string;
  candidateId: string;
  documentId?: string;
  pdfBuffer?: Buffer;
  pdfBase64?: string;
  fileName?: string;
  /** Optional context for improved extraction */
  jobTitle?: string;
  requiredSkills?: string[];
}

export interface AiCvProcessingResult {
  success: boolean;
  usedAi: boolean;
  fallbackUsed: boolean;
  error?: string;
}

export interface AiVacancyRequest {
  tenantId: string;
  rawVacancy: string;
}

export interface AiVacancyResult {
  success: boolean;
  vacancy: Record<string, unknown> | undefined;
  error: string | undefined;
}

// ─── Queue ────────────────────────────────────────────────────────

let aiQueue: ReturnType<typeof createQueue> | null = null;

function getAiQueue() {
  if (!aiQueue) {
    aiQueue = createQueue(AI_QUEUE_NAME);
  }
  return aiQueue;
}

// ─── CV Processing (Synchronous Entry Point) ──────────────────────

/**
 * Entry point for AI CV processing. Called from the application submission flow.
 *
 * This function does NOT wait for Gemini — it queues the job and returns
 * immediately. The candidate submission completes independent of AI.
 */
export async function requestAiCvProcessing(
  request: AiCvProcessingRequest,
): Promise<AiCvProcessingResult> {
  // Feature flag check
  if (!AI_ENABLED || !AI_CV_PROCESSING) {
    return { success: true, usedAi: false, fallbackUsed: false };
  }

  try {
    // 1. Extract text from PDF
    let pdfText: string | undefined;
    let documentHash: string | undefined;

    if (request.pdfBuffer) {
      const extraction = await extractPdfText(
        request.pdfBuffer,
        request.fileName ?? "cv.pdf",
      );
      if (!extraction.success) {
        // Log extraction failure but don't block submission
        console.warn(
          `[AI Service] PDF extraction failed: ${extraction.error?.message}`,
        );
        return { success: true, usedAi: false, fallbackUsed: false };
      }
      pdfText = extraction.text;
      documentHash = await hashDocument(request.pdfBuffer);
    } else if (request.pdfBase64) {
      const buffer = Buffer.from(request.pdfBase64, "base64");
      const extraction = await extractPdfText(
        buffer,
        request.fileName ?? "cv.pdf",
      );
      if (!extraction.success) {
        console.warn(
          `[AI Service] PDF extraction failed: ${extraction.error?.message}`,
        );
        return { success: true, usedAi: false, fallbackUsed: false };
      }
      pdfText = extraction.text;
      documentHash = await hashDocument(buffer);
    }

    if (!pdfText || !documentHash) {
      return { success: true, usedAi: false, fallbackUsed: false };
    }

    // 2. Check deduplication
    const existingResultId = await findExistingResult(documentHash);
    if (existingResultId) {
      console.log(
        `[AI Service] Reusing existing AI result for document hash`,
      );
      // TODO: Apply the existing result to this application
      return { success: true, usedAi: true, fallbackUsed: false };
    }

    // 3. Create AI job record
    const jobId = await createAiJob({
      tenantId: request.tenantId,
      applicationId: request.applicationId,
      candidateId: request.candidateId,
      ...(request.documentId ? { documentId: request.documentId } : {}),
      jobType: "cv_processing",
      inputHash: documentHash,
      inputSummary: `CV for application ${request.applicationId}`,
    });

    if (!jobId) {
      return { success: true, usedAi: false, fallbackUsed: false };
    }

    // 4. Check circuit breaker
    if (!(await shouldAllowRequest("gemini"))) {
      await updateAiJob(jobId, { status: "fallback_processing" });
      await logAiEvent({
        jobId,
        tenantId: request.tenantId,
        eventType: "fallback_started",
        errorCode: AI_ERROR_CODES.FALLBACK_ACTIVATED,
        errorMessage: "Circuit breaker open — falling back to ORS processor",
      });
      return { success: true, usedAi: false, fallbackUsed: true };
    }

    // 5. Queue for background processing
    await updateAiJob(jobId, {
      status: "queued",
      queuedAt: new Date().toISOString(),
    });

    await logAiEvent({
      jobId,
      tenantId: request.tenantId,
      eventType: "queued",
    });

    const queue = getAiQueue();
    await queue.add(
      "process-cv",
      {
        jobId,
        tenantId: request.tenantId,
        applicationId: request.applicationId,
        candidateId: request.candidateId,
        documentId: request.documentId,
        pdfText,
        documentHash,
        jobTitle: request.jobTitle,
        requiredSkills: request.requiredSkills,
      },
      {
        delay: AI_REQUEST_INTERVAL_MS, // 10-second spacing
        attempts: AI_MAX_RETRIES,
        backoff: {
          type: "exponential",
          delay: AI_REQUEST_INTERVAL_MS,
        },
        removeOnComplete: true,
        removeOnFail: 100, // Keep last 100 failed jobs
      },
    );

    return { success: true, usedAi: true, fallbackUsed: false };
  } catch (err) {
    console.error("[AI Service] CV processing request failed:", err);
    return { success: true, usedAi: false, fallbackUsed: false };
  }
}

// ─── CV Processing (Worker Handler) ───────────────────────────────

/**
 * Process a CV AI job — called by the AI worker.
 * This is the heavy-lifting function that actually calls Gemini.
 */
export async function processAiCvJob(jobData: {
  jobId: string;
  tenantId: string;
  applicationId: string;
  candidateId: string;
  pdfText: string;
  documentHash: string;
  jobTitle?: string;
  requiredSkills?: string[];
}): Promise<{ success: boolean; fallbackUsed: boolean }> {
  const startTime = Date.now();

  try {
    // 1. Update status
    await updateAiJob(jobData.jobId, {
      status: "processing",
      startedAt: new Date().toISOString(),
    });
    await logAiEvent({
      jobId: jobData.jobId,
      tenantId: jobData.tenantId,
      eventType: "started",
    });

    // 2. Call Gemini
    const attempt = 1;
    await logAiEvent({
      jobId: jobData.jobId,
      tenantId: jobData.tenantId,
      eventType: "attempt",
      attemptNumber: attempt,
    });

    const result = await analyzeCv(jobData.pdfText, {
      ...(jobData.jobTitle ? { jobTitle: jobData.jobTitle } : {}),
      ...(jobData.requiredSkills ? { requiredSkills: jobData.requiredSkills } : {}),
    });

    const durationMs = Date.now() - startTime;

    if (!result.success) {
      // Check if this is a retryable error
      const isRetryable = result.error?.retryable ?? false;
      const errorCode = result.error?.code ?? AI_ERROR_CODES.INVALID_RESPONSE;

      await recordFailure("gemini", errorCode);
      await logAiEvent({
        jobId: jobData.jobId,
        tenantId: jobData.tenantId,
        eventType: "error",
        attemptNumber: attempt,
        status: "error",
        errorCode,
        ...(result.error?.message ? { errorMessage: result.error.message } : {}),
        durationMs,
      });

      if (isRetryable) {
      await updateAiJob(jobData.jobId, {
        status: "retry_scheduled",
        attempts: attempt,
        ...(result.error?.message ? { lastError: result.error.message } : {}),
        errorCode,
        nextRetryAt: new Date(
          Date.now() + AI_REQUEST_INTERVAL_MS * attempt,
        ).toISOString(),
      });
        return { success: false, fallbackUsed: false };
      }

      // Non-retryable → fallback
      return await handleFallback(jobData, errorCode, result.error?.message, durationMs);
    }

    // 3. Success — validate and store
    await recordSuccess("gemini");
    await logAiEvent({
      jobId: jobData.jobId,
      tenantId: jobData.tenantId,
      eventType: "success",
      attemptNumber: attempt,
      status: "success",
      durationMs,
    });

    // 4. Store the AI result
    const resultId = crypto.randomUUID();
    await dbExecute(
      `INSERT INTO ai_results (id, job_id, tenant_id, document_hash, candidate_name, candidate_email, candidate_phone, education, experience, skills, certifications, total_experience_years, relevant_experience, confidence, raw_output, normalization_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        resultId,
        jobData.jobId,
        jobData.tenantId,
        jobData.documentHash,
        result.candidateMeta?.name ?? null,
        result.candidateMeta?.email ?? null,
        result.candidateMeta?.phone ?? null,
        JSON.stringify(result.scoringInput?.education ?? []),
        JSON.stringify(result.scoringInput?.experienceEntries ?? []),
        JSON.stringify(result.scoringInput?.skills ?? []),
        JSON.stringify(result.scoringInput?.certifications ?? []),
        result.scoringInput?.yearsExperience ?? 0,
        JSON.stringify([]),
        "medium",
        result.rawResponse ?? null,
        "Normalized via Gemini CV analysis pipeline",
      ],
    );

    // 5. Record document hash for deduplication
    await recordDocumentHash({
      documentHash: jobData.documentHash,
      tenantId: jobData.tenantId,
      applicationId: jobData.applicationId,
      resultId,
    });

    // 6. Mark job complete
    await updateAiJob(jobData.jobId, {
      status: "completed",
      completedAt: new Date().toISOString(),
      attempts: attempt,
      ...(result.rawResponse ? { rawResponse: result.rawResponse } : {}),
      parsedOutput: JSON.stringify(result.candidateData),
    });

    // 7. Trigger the existing scoring engine with AI-normalized input
    await triggerScoringWithAiResult(jobData, result);

    return { success: true, fallbackUsed: false };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.error("[AI Service] CV job processing failed:", err);
    await logAiEvent({
      jobId: jobData.jobId,
      tenantId: jobData.tenantId,
      eventType: "error",
      status: "error",
      errorCode: AI_ERROR_CODES.GEMINI_UNAVAILABLE,
      errorMessage: String(err),
      durationMs,
    });
    return await handleFallback(
      jobData,
      AI_ERROR_CODES.GEMINI_UNAVAILABLE,
      String(err),
      durationMs,
    );
  }
}

// ─── Fallback ─────────────────────────────────────────────────────

async function handleFallback(
  jobData: {
    jobId: string;
    tenantId: string;
    applicationId: string;
  },
  errorCode: string,
  errorMessage: string | undefined,
  durationMs: number,
): Promise<{ success: boolean; fallbackUsed: boolean }> {
  if (!AI_FALLBACK_ENABLED) {
    await updateAiJob(jobData.jobId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      ...(errorMessage ? { lastError: errorMessage } : {}),
      errorCode,
    });
    return { success: false, fallbackUsed: false };
  }

  // Trigger existing ORS scoring engine as fallback
  await updateAiJob(jobData.jobId, { status: "fallback_processing" });
  await logAiEvent({
    jobId: jobData.jobId,
    tenantId: jobData.tenantId,
    eventType: "fallback_started",
    errorCode,
    ...(errorMessage ? { errorMessage } : {}),
    durationMs,
  });

  try {
    // Trigger the existing scoring worker
    const scoringQueue = createQueue("scoring");
    await scoringQueue.add(
      "score-application",
      {
        applicationId: jobData.applicationId,
        tenantId: jobData.tenantId,
      },
      { attempts: 2 },
    );

    await updateAiJob(jobData.jobId, {
      status: "fallback_completed",
      completedAt: new Date().toISOString(),
    });
    await logAiEvent({
      jobId: jobData.jobId,
      tenantId: jobData.tenantId,
      eventType: "fallback_completed",
    });

    return { success: true, fallbackUsed: true };
  } catch (err) {
    await updateAiJob(jobData.jobId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      lastError: `Fallback also failed: ${err}`,
      errorCode: AI_ERROR_CODES.FALLBACK_ACTIVATED,
    });
    return { success: false, fallbackUsed: false };
  }
}

// ─── Scoring Integration ──────────────────────────────────────────

/**
 * Feed AI-normalized candidate data into the existing ORS scoring engine.
 */
async function triggerScoringWithAiResult(
  jobData: {
    applicationId: string;
    tenantId: string;
  },
  result: { scoringInput?: any },
): Promise<void> {
  try {
    const application = await dbQueryFirst(
      "SELECT * FROM applications WHERE id = $1",
      [jobData.applicationId],
    );
    if (!application) return;

    const campaign = await dbQueryFirst(
      "SELECT * FROM campaigns WHERE id = $1",
      [application.campaign_id],
    );
    if (!campaign) return;

    // Check if campaign uses v2 scoring model
    const scoringModelRaw = (campaign as any).scoring_model;
    if (scoringModelRaw) {
      const { scoreApplicationV2 } = await import("../ors-scoring-v2");
      const scoringModel =
        typeof scoringModelRaw === "string"
          ? JSON.parse(scoringModelRaw)
          : scoringModelRaw;

      const v2Result = scoreApplicationV2(scoringModel, result.scoringInput);

      // Update application with AI-enhanced score
      await dbExecute(
        `UPDATE applications SET
           score = $1,
           score_breakdown = $2,
           recommendation = $3,
           eligibility_status = $4,
           score_reasons = $5,
           score_version = 6
         WHERE id = $6`,
        [
          v2Result.total,
          JSON.stringify(v2Result.breakdown),
          v2Result.recommendation,
          v2Result.eligibility.eligible ? "eligible" : "not_eligible",
          JSON.stringify(v2Result.reasons),
          jobData.applicationId,
        ],
      );
    } else {
      // Fall back to v1 scoring
      const { scoreApplication } = await import("../ors");

      const education = await dbQuery(
        "SELECT * FROM candidate_education WHERE application_id = $1",
        [jobData.applicationId],
      );

      const scored = scoreApplication(
        {
          min_qualification: campaign.min_qualification,
          min_experience_years: Number(campaign.min_experience_years ?? 0),
          required_skills: JSON.parse(
            campaign.required_skills ?? "[]",
          ) as string[],
          required_certifications: JSON.parse(
            campaign.required_certifications ?? "[]",
          ) as string[],
        },
        {
          highest_qualification:
            (education as any[])[0]?.qualification ?? null,
          years_experience: result.scoringInput?.yearsExperience ?? 0,
          skills: result.scoringInput?.skills ?? [],
          certifications: result.scoringInput?.certifications ?? [],
          work_fields: (
            result.scoringInput?.experienceEntries ?? []
          ).map((e: any) => e.field).filter(Boolean),
          referee_count: 0,
          answers: {},
          questions: [],
        },
      );

      await dbExecute(
        `UPDATE applications SET
           score = $1,
           recommendation = $2,
           score_breakdown = $3,
           eligibility_status = $4,
           score_version = 6
         WHERE id = $5`,
        [
          scored.total,
          scored.recommendation,
          JSON.stringify(scored.breakdown),
          scored.eligible ? "eligible" : "not_eligible",
          jobData.applicationId,
        ],
      );
    }
  } catch (err) {
    console.error("[AI Service] Failed to trigger scoring:", err);
  }
}

// ─── Vacancy Processing ───────────────────────────────────────────

/**
 * Structure a pasted vacancy using Gemini.
 * Called directly from the recruiter UI (synchronous — waits for response).
 */
export async function processVacancyStructuring(
  request: AiVacancyRequest,
): Promise<AiVacancyResult> {
  if (!AI_ENABLED || !AI_VACANCY_ASSISTANT) {
    return {
      success: false,
      vacancy: undefined,
      error: "AI vacancy assistant is not enabled",
    };
  }

  if (!(await shouldAllowRequest("gemini"))) {
    return {
      success: false,
      vacancy: undefined,
      error: "AI service is currently unavailable. Please create the vacancy manually.",
    };
  }

  const startTime = Date.now();

  try {
    const result = await structureVacancy(request.rawVacancy);

    if (result.success) {
      await recordSuccess("gemini");
      return { success: true, vacancy: result.vacancy, error: undefined };
    }

    if (result.error) {
      await recordFailure("gemini", result.error.code);
      return { success: false, vacancy: undefined, error: result.error.message };
    }
    return { success: false, vacancy: undefined, error: "Unknown error" };
  } catch (err) {
    await recordFailure("gemini", AI_ERROR_CODES.GEMINI_UNAVAILABLE);
    return {
      success: false,
      vacancy: undefined,
      error: "AI processing failed. Please create the vacancy manually.",
    };
  }
}
