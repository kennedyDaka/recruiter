-- Tenant-level settings (JSON), e.g. opt-in auto-pipeline triage.
-- Off by default: recruiters enable it explicitly at registration or in Settings.

ALTER TABLE tenants ADD COLUMN settings TEXT;
