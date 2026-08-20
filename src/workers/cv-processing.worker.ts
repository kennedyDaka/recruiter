import { createWorker } from "@/lib/queue";

/**
 * CV Processing Worker
 * Processes uploaded CVs: parses, extracts data, stores metadata.
 * Runs in background so API stays responsive.
 */
const cvWorker = createWorker("cv-processing", async (job) => {
  const { applicationId, tenantId, filePath, storageKey } = job.data;

  console.log(`[CV Worker] Processing application ${applicationId}`);

  // TODO: Implement CV parsing (pdf-parse, mammoth, etc.)
  // Steps:
  // 1. Download file from R2 using storageKey
  // 2. Parse CV content (PDF → text, DOCX → text)
  // 3. Extract structured data (education, experience, skills)
  // 4. Store parsed data in candidate_records or update candidate
  // 5. Trigger scoring worker

  return {
    applicationId,
    status: "processed",
    extractedData: null, // Will contain parsed CV data
  };
});

cvWorker.on("completed", (job) => {
  console.log(`[CV Worker] Completed: ${job.id}`);
});

cvWorker.on("failed", (job, err) => {
  console.error(`[CV Worker] Failed: ${job?.id}`, err);
});

export default cvWorker;
