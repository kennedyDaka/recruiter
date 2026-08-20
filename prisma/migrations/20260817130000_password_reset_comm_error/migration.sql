-- Password reset: token + expiry mirror the email-verification columns.
ALTER TABLE profiles ADD COLUMN reset_token TEXT;
ALTER TABLE profiles ADD COLUMN reset_expires_at TEXT;

-- Bumped on every password change so previously issued session JWTs die
-- immediately (old tokens carry sessionVersion 0 / missing, new ones match).
ALTER TABLE profiles ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;

-- Stores the provider error (e.g. Resend 403 domain-not-verified) so the
-- Settings page can surface a precise fix instead of a silent failure.
ALTER TABLE communications ADD COLUMN error TEXT;
