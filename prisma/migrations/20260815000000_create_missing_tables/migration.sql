-- Create all tables from prisma/schema.prisma that were missing from the dev
-- database. Follows the same conventions as the pre-existing tables:
--   id TEXT PRIMARY KEY            (ids are generated in application code)
--   DATETIME DEFAULT CURRENT_TIMESTAMP for created_at/updated_at
--   INTEGER for booleans
-- Raw SQL inserts omit id/created_at/updated_at, so every column with a
-- @default in Prisma gets a matching SQL default.

-- ─── Campaigns ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaigns (
  id                      TEXT PRIMARY KEY,
  tenant_id               TEXT NOT NULL,
  name                    TEXT NOT NULL,
  slug                    TEXT UNIQUE NOT NULL,
  job_title               TEXT NOT NULL,
  job_description         TEXT,
  hiring_reason           TEXT,
  positions               INTEGER NOT NULL DEFAULT 1,
  location                TEXT,
  employment_type         TEXT,
  min_qualification       TEXT,
  min_experience_years    INTEGER NOT NULL DEFAULT 0,
  required_skills         TEXT NOT NULL DEFAULT '[]',
  required_certifications TEXT NOT NULL DEFAULT '[]',
  responsibilities        TEXT,
  required_documents      TEXT NOT NULL DEFAULT '[]',
  salary_min              INTEGER,
  salary_max              INTEGER,
  salary_currency         TEXT NOT NULL DEFAULT 'MWK',
  start_date              DATETIME,
  closing_date            DATETIME,
  published_at            DATETIME,
  public_token            TEXT UNIQUE,
  weights                 TEXT,
  thresholds              TEXT,
  builder                 TEXT,
  competencies            TEXT NOT NULL DEFAULT '[]',
  referee_count           INTEGER NOT NULL DEFAULT 2,
  status                  TEXT NOT NULL DEFAULT 'draft',
  created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_status ON campaigns(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created ON campaigns(created_at);

CREATE TABLE IF NOT EXISTS campaign_questions (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  campaign_id   TEXT NOT NULL,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'text',
  options       TEXT,
  dimension     TEXT,
  weight        INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  category      TEXT,
  is_mandatory  INTEGER NOT NULL DEFAULT 0,
  condition     TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_campaign_questions_campaign ON campaign_questions(campaign_id);

CREATE TABLE IF NOT EXISTS campaign_answer_options (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  question_id      TEXT NOT NULL,
  label            TEXT NOT NULL,
  value            TEXT NOT NULL,
  points           INTEGER NOT NULL DEFAULT 0,
  is_disqualifying INTEGER NOT NULL DEFAULT 0,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (question_id) REFERENCES campaign_questions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_campaign_answer_options_question ON campaign_answer_options(question_id);

CREATE TABLE IF NOT EXISTS recruitment_stages (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  is_terminal INTEGER NOT NULL DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_recruitment_stages_campaign ON recruitment_stages(campaign_id);

-- ─── Candidates ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS candidates (
  id                   TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL,
  first_name           TEXT NOT NULL,
  middle_name          TEXT,
  last_name            TEXT NOT NULL,
  email                TEXT NOT NULL,
  phone                TEXT,
  date_of_birth        TEXT,
  gender               TEXT,
  nationality          TEXT,
  location             TEXT,
  country              TEXT,
  city                 TEXT,
  professional_summary TEXT,
  linkedin_url         TEXT,
  portfolio_url        TEXT,
  cv_url               TEXT,
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_candidates_tenant ON candidates(tenant_id);

CREATE TABLE IF NOT EXISTS candidate_education (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  application_id TEXT NOT NULL,
  qualification  TEXT NOT NULL,
  field_of_study TEXT,
  institution    TEXT,
  country        TEXT,
  start_year     INTEGER,
  end_year       INTEGER,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_candidate_education_application ON candidate_education(application_id);

CREATE TABLE IF NOT EXISTS candidate_experience (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL,
  application_id     TEXT NOT NULL,
  employer           TEXT NOT NULL,
  position           TEXT NOT NULL,
  start_date         TEXT,
  end_date           TEXT,
  is_current         INTEGER NOT NULL DEFAULT 0,
  responsibilities   TEXT,
  reason_for_leaving TEXT,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_candidate_experience_application ON candidate_experience(application_id);

CREATE TABLE IF NOT EXISTS candidate_skills (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  application_id TEXT NOT NULL,
  skill          TEXT NOT NULL,
  category       TEXT,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_candidate_skills_application ON candidate_skills(application_id);

CREATE TABLE IF NOT EXISTS candidate_documents (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  application_id TEXT NOT NULL,
  doc_type       TEXT NOT NULL,
  file_name      TEXT NOT NULL,
  file_path      TEXT NOT NULL,
  file_size      INTEGER NOT NULL DEFAULT 0,
  storage_key    TEXT,
  uploaded_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_candidate_documents_application ON candidate_documents(application_id);

CREATE TABLE IF NOT EXISTS candidate_referees (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  application_id TEXT NOT NULL,
  name           TEXT NOT NULL,
  organisation   TEXT,
  position       TEXT,
  relationship   TEXT,
  phone          TEXT,
  email          TEXT,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_candidate_referees_application ON candidate_referees(application_id);

-- ─── Applications ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS applications (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL,
  campaign_id           TEXT NOT NULL,
  candidate_id          TEXT NOT NULL,
  reference             TEXT UNIQUE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'submitted',
  stage_id              TEXT,
  score                 INTEGER NOT NULL DEFAULT 0,
  score_breakdown       TEXT,
  recommendation        TEXT,
  mandatory_status      TEXT,
  mandatory_reasons     TEXT NOT NULL DEFAULT '[]',
  years_experience      INTEGER NOT NULL DEFAULT 0,
  highest_qualification TEXT,
  cv_url                TEXT,
  consent_given         INTEGER NOT NULL DEFAULT 0,
  consent_given_at      DATETIME,
  consent_version       TEXT,
  submitted_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  FOREIGN KEY (stage_id) REFERENCES recruitment_stages(id) ON DELETE SET NULL,
  UNIQUE (tenant_id, campaign_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS idx_applications_tenant ON applications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_applications_campaign ON applications(campaign_id);
CREATE INDEX IF NOT EXISTS idx_applications_candidate ON applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);

CREATE TABLE IF NOT EXISTS candidate_answers (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  application_id TEXT NOT NULL,
  question_id    TEXT,
  question_text  TEXT NOT NULL,
  answer         TEXT,
  dimension      TEXT,
  points         INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES campaign_questions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_candidate_answers_application ON candidate_answers(application_id);

CREATE TABLE IF NOT EXISTS application_stage_history (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  application_id TEXT NOT NULL,
  from_stage     TEXT,
  to_stage       TEXT NOT NULL,
  changed_by     TEXT,
  notes          TEXT,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_application_stage_history_application ON application_stage_history(application_id);

-- ─── Interviews ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS interviews (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  application_id TEXT NOT NULL,
  scheduled_at   DATETIME,
  duration_min   INTEGER NOT NULL DEFAULT 30,
  interviewer    TEXT,
  location       TEXT,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'scheduled',
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_interviews_application ON interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_tenant ON interviews(tenant_id);

CREATE TABLE IF NOT EXISTS interview_scores (
  id           TEXT PRIMARY KEY,
  interview_id TEXT NOT NULL,
  dimension    TEXT NOT NULL,
  score        INTEGER NOT NULL,
  max_score    INTEGER NOT NULL DEFAULT 10,
  notes        TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_interview_scores_interview ON interview_scores(interview_id);

-- ─── Communications & Notes ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS communications (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  application_id TEXT,
  channel        TEXT NOT NULL DEFAULT 'email',
  template       TEXT,
  subject        TEXT,
  body           TEXT,
  recipient      TEXT,
  status         TEXT NOT NULL DEFAULT 'queued',
  sent_at        DATETIME,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_communications_tenant ON communications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_communications_status ON communications(status);

CREATE TABLE IF NOT EXISTS notes (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  application_id TEXT,
  author_id      TEXT,
  body           TEXT NOT NULL,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_application ON notes(application_id);

-- ─── Audit Logs ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  actor_id   TEXT NOT NULL,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  metadata   TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);

-- ─── Billing ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaign_invoices (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  days        INTEGER NOT NULL,
  daily_rate  INTEGER NOT NULL,
  amount      INTEGER NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'MWK',
  provider    TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  tx_ref      TEXT,
  paid_at     DATETIME,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_campaign_invoices_tenant ON campaign_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaign_invoices_campaign ON campaign_invoices(campaign_id);

-- ─── Recruitment Catalog ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS skill_library (
  id       TEXT PRIMARY KEY,
  name     TEXT UNIQUE NOT NULL,
  category TEXT
);

CREATE TABLE IF NOT EXISTS certification_library (
  id       TEXT PRIMARY KEY,
  name     TEXT UNIQUE NOT NULL,
  category TEXT
);

CREATE TABLE IF NOT EXISTS license_library (
  id       TEXT PRIMARY KEY,
  name     TEXT UNIQUE NOT NULL,
  category TEXT
);

CREATE TABLE IF NOT EXISTS industries (
  id   TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS job_families (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  industry_id TEXT,
  FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS job_titles (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  family_id TEXT,
  FOREIGN KEY (family_id) REFERENCES job_families(id) ON DELETE SET NULL
);

-- ─── Missing indexes on existing tables ─────────────────────────────
-- user_roles @@unique([user_id, role]) is required for ON CONFLICT upserts.

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_user_role ON user_roles(user_id, role);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant ON user_roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON profiles(tenant_id);
