-- Adds users.safeguards_acknowledged_at — timestamp of when the user
-- acknowledged the trading safeguards onboarding modal. NULL = first-time
-- user, modal shown on next login. Non-null = already seen, modal skipped.
--
-- Phase 6b — multi-user onboarding readiness. Idempotent.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "safeguards_acknowledged_at" timestamp with time zone;
