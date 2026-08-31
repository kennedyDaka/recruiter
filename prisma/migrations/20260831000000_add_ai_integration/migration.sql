-- AI Integration Layer
-- Tables: ai_jobs, ai_processing_logs, ai_provider_status, ai_results, ai_document_hashes

-- AI processing jobs — tracks every Gemini request through its lifecycle
CREATE TABLE IF NOT EXISTS ai_jobs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id TEXT,
  candidate_id TEXT,
  document_id TEXT,

  job_type TEXT NOT NULL DEFAULT 'cv_processing',
  status TEXT NOT NULL DEFAULT 'created',
  priority INT NOT NULL DEFAULT 0,

  provider TEXT NOT NULL DEFAULT 'gemini',
  provider_job_id TEXT,

  input_hash TEXT,
  input_summary TEXT,
  raw_response TEXT,
  parsed_output TEXT,

  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  last_error TEXT,
  error_code TEXT,

  queued_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_tenant_status ON ai_jobs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_type_status ON ai_jobs(tenant_id, job_type, status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_retry ON ai_jobs(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_hash ON ai_jobs(input_hash);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_application ON ai_jobs(application_id);

-- AI processing logs — detailed audit trail
CREATE TABLE IF NOT EXISTS ai_processing_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  job_id TEXT NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,

  event_type TEXT NOT NULL,
  attempt_number INT NOT NULL DEFAULT 1,
  provider TEXT NOT NULL DEFAULT 'gemini',

  status TEXT,
  error_code TEXT,
  error_message TEXT,
  http_status INT,

  duration_ms INT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_logs_job ON ai_processing_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_ai_logs_tenant ON ai_processing_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_logs_error ON ai_processing_logs(error_code);

-- AI provider status — tracks health and circuit breaker state
CREATE TABLE IF NOT EXISTS ai_provider_status (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  provider TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  circuit_state TEXT NOT NULL DEFAULT 'closed',
  failure_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_health_check TIMESTAMPTZ,
  next_available_at TIMESTAMPTZ,
  total_requests INT NOT NULL DEFAULT 0,
  total_failures INT NOT NULL DEFAULT 0,
  avg_response_ms INT NOT NULL DEFAULT 0,
  metadata TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI results — reusable structured candidate profiles
CREATE TABLE IF NOT EXISTS ai_results (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  job_id TEXT NOT NULL UNIQUE REFERENCES ai_jobs(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  document_hash TEXT,
  candidate_name TEXT,
  candidate_email TEXT,
  candidate_phone TEXT,

  education TEXT,
  experience TEXT,
  skills TEXT,
  certifications TEXT,
  total_experience_years DOUBLE PRECISION,
  relevant_experience TEXT,
  additional_info TEXT,

  confidence TEXT,
  raw_output TEXT,
  normalization_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_results_tenant_hash ON ai_results(tenant_id, document_hash);
CREATE INDEX IF NOT EXISTS idx_ai_results_hash ON ai_results(document_hash);

-- AI document hashes — prevents re-processing identical CVs
CREATE TABLE IF NOT EXISTS ai_document_hashes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_hash TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  application_id TEXT,
  document_id TEXT,
  file_name TEXT,
  file_size INT,
  result_id TEXT,
  provider TEXT NOT NULL DEFAULT 'gemini',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_doc_hash_tenant ON ai_document_hashes(tenant_id, document_hash);
CREATE INDEX IF NOT EXISTS idx_ai_doc_hash ON ai_document_hashes(document_hash);
