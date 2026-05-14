-- User tier (subscription plan) — Phase 1 of the billing rollout.
--
-- Tier system goes live BEFORE actual payment integration. Lets us:
--   1. Make /pricing accurate (it currently describes tier scopes that
--      aren't enforced anywhere in the codebase — pure marketing copy)
--   2. Manually grant tiers to beta users via /dashboard/admin so we
--      can operate as invite-only before wiring Stripe
--   3. Have the gates already in place when Stripe ships (Phase 2)
--
-- Columns:
--   tier              'free' | 'trader' | 'premium' | 'enterprise'
--   tier_changed_at   When the tier last changed (audit-trail-lite)
--   tier_expires_at   Soft expiry for paid tiers (post-cancellation
--                     still-paid window before they drop to free).
--                     NULL for free users + auto-renewing paid users.
--
-- Default 'free' so all existing users (including admins) downgrade on
-- migration apply. Admin user gets bumped to 'enterprise' immediately
-- after migration via a one-liner so they don't lock themselves out
-- of paid features.
--
-- Idempotent. Safe to re-apply.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tier_changed_at TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tier_expires_at TIMESTAMPTZ;

-- Constraint: tier must be one of the four allowed values. Caught at
-- the DB level so any code path that writes a typo gets a hard error
-- instead of silently breaking gating logic.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_tier_valid'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_tier_valid
      CHECK (tier IN ('free', 'trader', 'premium', 'enterprise'));
  END IF;
END $$;

-- Helpful index for queries like "all active premium users" or admin
-- filtering. Partial index keeps it small (default free users are
-- typically the majority and don't need indexing by tier).
CREATE INDEX IF NOT EXISTS users_tier_idx
  ON users (tier)
  WHERE tier != 'free';

-- Grandfather all existing admin users to enterprise. Run-once via the
-- WHERE clause checking for the default 'free' value (so re-running the
-- migration doesn't blast over an already-set tier).
UPDATE users
SET tier = 'enterprise',
    tier_changed_at = NOW()
WHERE role = 'admin' AND tier = 'free';
