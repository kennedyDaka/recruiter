-- Missing Data system: a platform-wide job-title master so a recruiter-added
-- title becomes searchable for every tenant, and provenance/verification
-- status on universities so manually added institutions are trackable.

CREATE TABLE IF NOT EXISTS job_title_master (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  family_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE universities ADD COLUMN source TEXT NOT NULL DEFAULT 'hipo';
ALTER TABLE universities ADD COLUMN status TEXT NOT NULL DEFAULT 'verified';
