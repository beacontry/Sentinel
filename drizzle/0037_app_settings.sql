-- 0037 — app_settings table for NON-secret server-wide configuration
-- (feature flags, toggles, etc.). Sibling of system_config (which is
-- for encrypted secrets only).
--
-- Distinct from system_config because:
--   1. Plaintext values are fine here (no encryption overhead)
--   2. Allows separate access policy: API keys vs feature flags
--   3. Audit metadata can safely include the value (boolean true/false
--      isn't sensitive; an encrypted API key obviously is)
--
-- Helpers live in src/lib/app-settings.ts.
-- Known keys allow-listed in code; admins can't write arbitrary keys
-- via the UI.
--
-- Idempotent — safe to run multiple times.

BEGIN;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_settings_updated_at_idx
  ON app_settings(updated_at DESC);

COMMIT;
