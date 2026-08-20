-- University master library, synced from the Hipo Universities API
-- (https://github.com/Hipo/university-domains-list). Institutions are the
-- shared source for the applicant education form — no free typing.

CREATE TABLE IF NOT EXISTS universities (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  country        TEXT,
  alpha_two_code TEXT,
  domains        TEXT,
  web_pages      TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_universities_name_country ON universities(name, country);
CREATE INDEX IF NOT EXISTS idx_universities_country ON universities(country);
