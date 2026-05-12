-- Click-through acceptance of Terms of Service + Risk Disclosure.
-- One-time on first dashboard load (or first dashboard load after the
-- current version was last updated, hence the version column instead of
-- a plain boolean — bumping the version forces re-acceptance).
--
-- Tracks BOTH which version the user accepted and when, so we can
-- show "you accepted v1 on X date" if there's ever a dispute.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_accepted_version text;

COMMIT;
