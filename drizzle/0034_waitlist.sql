-- Beacontry waitlist signups from the public landing page.
--
-- Pre-launch email capture. Distinct from the `invites` table (which is
-- admin-driven onboarding for users who already have a confirmed slot) —
-- waitlist signups are public-facing, unsolicited, and don't grant any
-- access. Admins later review the list and send formal invites from the
-- existing /dashboard/admin → Invitations flow.
--
-- Columns:
--   email          Required, lowercased on insert.
--   source         Optional referrer / utm tag for marketing attribution.
--   user_agent     Captured on signup, useful for spam detection later.
--   ip             Same — coarse rate-limiting and abuse signal.
--   notes          Admin notes (e.g. "asked about pricing", "Twitter DM").
--   converted_at   Set when an invite is sent for this email (joined to
--                   the existing invite flow).
--   created_at     Signup timestamp.
--
-- Case-insensitive uniqueness on email — same person re-signing-up just
-- updates created_at (handled at the route level with ON CONFLICT) rather
-- than creating duplicate rows.

CREATE TABLE IF NOT EXISTS waitlist (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL,
  source       TEXT,
  user_agent   TEXT,
  ip           TEXT,
  notes        TEXT,
  converted_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_uniq
  ON waitlist (LOWER(email));

CREATE INDEX IF NOT EXISTS waitlist_created_idx
  ON waitlist (created_at DESC);
