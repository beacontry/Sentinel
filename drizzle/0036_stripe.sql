-- Phase C — Stripe billing integration.
--
-- Stripe is the source of truth for subscription state. We mirror
-- only what's needed to gate features at request time:
--   - users.stripe_customer_id: link to the Stripe Customer object
--   - users.tier + tier_expires_at: the actual gate (already exists)
--
-- Idempotent. Safe to re-run.

-- 1. users.stripe_customer_id — link to Stripe Customer (one-to-one,
--    nullable for users who've never started a checkout flow).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Unique partial index — multiple NULLs allowed (free users), but no
-- two users can share a Stripe Customer ID.
CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_customer_idx
  ON users (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- 2. stripe_events_processed — webhook idempotency dedup table.
--
-- Stripe retries webhooks for up to 3 days on failure, AND sometimes
-- re-delivers within the same hour for at-least-once semantics. Every
-- webhook event has a unique `evt_xxx` ID; we INSERT-OR-CONFLICT-DO-
-- NOTHING on it inside the handler. If the row already exists, we
-- skip the event (already processed). This prevents double-granting
-- tier on duplicate webhook delivery.
--
-- We could TTL this table (events older than 30 days are guaranteed
-- to not be retried), but the row size is tiny (~50 bytes) and
-- pruning hides bugs. Keep the full history; it's also useful for
-- forensics if a tier grant looks suspicious.
CREATE TABLE IF NOT EXISTS stripe_events_processed (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The user this event affected, if resolvable. NULL for events that
  -- don't carry user context (rare; mostly admin/system events).
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Audit trail — store the action we took so forensics can correlate
  -- a Stripe event with the tier change it caused.
  action_taken TEXT
);

CREATE INDEX IF NOT EXISTS stripe_events_processed_user_idx
  ON stripe_events_processed (user_id, processed_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS stripe_events_processed_type_idx
  ON stripe_events_processed (event_type, processed_at DESC);
