-- ORS v2: eligibility gates, explainable reasons, and score versioning.

ALTER TABLE applications ADD COLUMN eligibility_status TEXT;
ALTER TABLE applications ADD COLUMN eligibility_reasons TEXT;
ALTER TABLE applications ADD COLUMN score_reasons TEXT;
ALTER TABLE applications ADD COLUMN score_version INTEGER NOT NULL DEFAULT 1;
