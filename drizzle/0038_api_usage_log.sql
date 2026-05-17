-- 0038 — api_usage_log table for tracking external API consumption
-- (Groq, Finnhub, etc.). Powers the admin dashboard's cost-monitoring
-- view + helps catch runaway usage.
--
-- Aggregated daily by (date, provider). One row per provider-day, with
-- counters incremented via UPSERT on every external API call. Per-user
-- attribution deferred — current schema is server-wide aggregate only.
--
-- Idempotent — safe to run multiple times.

BEGIN;

CREATE TABLE IF NOT EXISTS api_usage_log (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  provider TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  tokens_used BIGINT NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  first_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (date, provider)
);

CREATE INDEX IF NOT EXISTS api_usage_log_date_idx ON api_usage_log(date DESC);
CREATE INDEX IF NOT EXISTS api_usage_log_provider_date_idx ON api_usage_log(provider, date DESC);

COMMIT;
