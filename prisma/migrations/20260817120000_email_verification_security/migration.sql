-- Email verification for signup + failed sign-in attempt tracking.

-- 1. Email verification state on profiles.
ALTER TABLE profiles ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN verify_token TEXT;
ALTER TABLE profiles ADD COLUMN verify_expires_at TEXT;

-- Existing accounts pre-date verification; treat them as verified so nobody
-- is locked out of an account they already use.
UPDATE profiles SET email_verified = TRUE;

-- 2. Failed authentication attempts (rate limiting / lockout).
CREATE TABLE IF NOT EXISTS auth_attempts (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  ip         TEXT,
  kind       TEXT NOT NULL DEFAULT 'signin',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_attempts_email ON auth_attempts(email);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip ON auth_attempts(ip);
