-- Per-user opt-in for the daily market digest delivered via email.
--
-- The market-digest cron currently fans out to Discord webhooks + PWA push
-- for every user. Add an email channel that's strictly opt-in (defaults
-- false) so we never email users who haven't asked.
--
-- Email goes to users.notification_email when set, falling back to
-- users.email. Cron skips users with digest_email_opt_in=false entirely.
--
-- Idempotent: IF NOT EXISTS guards the column add.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS digest_email_opt_in boolean NOT NULL DEFAULT false;

COMMIT;
