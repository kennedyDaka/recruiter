/**
 * AI Integration Layer — public API.
 *
 * Import from this module to use AI capabilities throughout ORS.
 * All AI functionality is behind feature flags — if AI_ENABLED=false,
 * the functions return immediately without side effects.
 */

// Configuration & Feature Flags
export {
  AI_ENABLED,
  AI_CV_PROCESSING,
  AI_VACANCY_ASSISTANT,
  AI_FALLBACK_ENABLED,
  AI_CIRCUIT_BREAKER_ENABLED,
  AI_WATCHDOG_ENABLED,
  AI_REQUEST_INTERVAL_MS,
  AI_MAX_RETRIES,
  AI_ERROR_CODES,
} from "./config";

// Main Service (orchestration)
export {
  requestAiCvProcessing,
  processAiCvJob,
  processVacancyStructuring,
} from "./service";

// Circuit Breaker
export {
  shouldAllowRequest,
  recordSuccess,
  recordFailure,
  getCircuitStatus,
  resetCircuit,
  runHealthCheck,
} from "./circuit-breaker";

// CV Analysis
export { analyzeCv } from "./cv-analysis";

// PDF Extraction
export { extractPdfText, extractPdfTextFromBase64, hashDocument } from "./pdf-extraction";

// Normalization
export {
  normalizeGeminiToScoringInput,
  normalizeGeminiVacancy,
} from "./normalization";

// Vacancy Structuring
export { structureVacancy } from "./vacancy-structuring";

// Logging & Monitoring
export {
  createAiJob,
  updateAiJob,
  logAiEvent,
  findExistingResult,
  recordDocumentHash,
  getAiHealthDashboard,
  getRecentLogs,
  getAiMetrics,
} from "./logging";

// Provider
export { getAiProvider } from "./provider";
export type { AiProvider, AiProviderResponse, AiProviderName } from "./provider";
