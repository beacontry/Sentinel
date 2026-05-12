-- Private user-to-user direct messages. Two tables:
--
-- dm_threads:  one row per pair of users, sorted by user-pair so the
--              (user_a_id, user_b_id) unique constraint catches both
--              orderings as the same thread. Stores last_message_at for
--              inbox sort.
-- dm_messages: append-only list of messages in a thread.
--
-- "Last seen" timestamps for unread counts live as columns on
-- dm_threads (one per side) — cheap and atomic, no separate read-state
-- table needed for this scale.
--
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS dm_threads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- user_a_id < user_b_id always — enforced by check + the unique index.
  -- Means we can look up a thread by either ordering with one query.
  user_a_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message_at  timestamptz NOT NULL DEFAULT now(),
  -- Per-side "last seen" — used to compute the unread badge on the inbox
  a_last_seen_at   timestamptz,
  b_last_seen_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dm_threads_distinct_users CHECK (user_a_id <> user_b_id),
  CONSTRAINT dm_threads_ordered_pair CHECK (user_a_id < user_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS dm_threads_pair_uniq
  ON dm_threads (user_a_id, user_b_id);
CREATE INDEX IF NOT EXISTS dm_threads_a_idx
  ON dm_threads (user_a_id);
CREATE INDEX IF NOT EXISTS dm_threads_b_idx
  ON dm_threads (user_b_id);
CREATE INDEX IF NOT EXISTS dm_threads_last_message_idx
  ON dm_threads (last_message_at DESC);

CREATE TABLE IF NOT EXISTS dm_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dm_messages_thread_idx
  ON dm_messages (thread_id);
CREATE INDEX IF NOT EXISTS dm_messages_thread_time_idx
  ON dm_messages (thread_id, created_at);

COMMIT;
