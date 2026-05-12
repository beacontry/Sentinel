-- Public-link sharing for watchlists. Each list can optionally have a
-- random opaque token; with one set, /w/[token] renders the list
-- read-only to anyone (no auth). With the token NULL (default), the
-- list is private to its owner.
--
-- Idempotent.

BEGIN;

ALTER TABLE watchlists
  ADD COLUMN IF NOT EXISTS share_token text;

-- Unique partial index — only enforces uniqueness when the token is set.
-- NULL share_tokens (the common case) don't collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS watchlists_share_token_uniq
  ON watchlists (share_token) WHERE share_token IS NOT NULL;

COMMIT;
