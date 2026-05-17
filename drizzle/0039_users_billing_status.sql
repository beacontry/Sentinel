-- 0039 — billing_status column on users for past-due banner.
--
-- Distinct from `tier` (which is the active plan) — billing_status
-- captures Stripe lifecycle state ('past_due', 'refunded', null/active).
-- Banner on /dashboard/* surfaces "past_due" so users know to update
-- their card before Stripe gives up retrying and downgrades them.
--
-- Set by /api/webhooks/stripe handlers:
--   invoice.payment_failed     → past_due
--   invoice.payment_succeeded  → null (clears banner)
--   customer.subscription.deleted → null (cleared with tier downgrade)
--   charge.refunded             → 'refunded' (logged + UI surface)
--
-- Idempotent — safe to run multiple times.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS billing_status TEXT;

CREATE INDEX IF NOT EXISTS users_billing_status_idx
  ON users(billing_status)
  WHERE billing_status IS NOT NULL;

COMMIT;
