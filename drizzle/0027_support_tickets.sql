-- Customer support ticketing — user opens a ticket, admin replies, both
-- sides see the thread. Email notifications via Resend on each message
-- so neither side has to refresh the dashboard.
--
-- Tickets have a status enum-ish field (text — easier to extend later):
--   open       — user submitted, awaiting admin
--   responded  — admin replied, awaiting user
--   resolved   — admin marked done
--   closed     — user closed (or admin force-closed)
--
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS support_tickets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject      text NOT NULL,
  status       text NOT NULL DEFAULT 'open',
  priority     text NOT NULL DEFAULT 'normal',  -- low | normal | high
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_tickets_user_idx
  ON support_tickets (user_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx
  ON support_tickets (status);
CREATE INDEX IF NOT EXISTS support_tickets_updated_idx
  ON support_tickets (updated_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_role text NOT NULL,   -- "user" | "admin"
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_ticket_idx
  ON support_messages (ticket_id);
CREATE INDEX IF NOT EXISTS support_messages_created_idx
  ON support_messages (created_at);

COMMIT;
