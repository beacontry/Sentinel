-- 0030 — system_config table for DB-backed encrypted server-wide
-- configuration (LLM API keys, third-party service keys, etc.).
--
-- Replaces the prior env-only approach where rotating GROQ_API_KEY
-- required SSH + `podman stop && rm && run`. Admin UI at
-- /dashboard/admin/system-config writes here.
--
-- Values are encrypted with AES-256-GCM via src/lib/crypto.ts before
-- INSERT. Plaintext never lives in the table or audit metadata.
--
-- key column is the env-var name (e.g. "GROQ_API_KEY") so the runtime
-- fallback chain stays understandable: DB -> process.env[<key>].
--
-- Idempotent — safe to run multiple times.

BEGIN;

CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value_encrypted TEXT NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS system_config_updated_at_idx
  ON system_config(updated_at DESC);

COMMIT;
