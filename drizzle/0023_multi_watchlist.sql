-- Phase A.1 — multi-watchlist support.
--
-- Adds a `watchlists` table so each user can have multiple named symbol
-- lists, and a `watchlist_id` FK on `watchlist_items` to scope items to a
-- specific list. Backfills every existing user's flat watchlist into a
-- new "Default" list owned by that user, then enforces NOT NULL on the FK.
--
-- After this migration:
--   * Each user has at least one watchlist row with isDefault=true (unless
--     they had zero items historically — then no rows for them; the API
--     auto-creates a "Default" on first write).
--   * The legacy unique constraint on (user_id, symbol) is replaced with
--     a unique constraint on (watchlist_id, symbol). The same symbol can
--     now appear in multiple lists owned by the same user.
--
-- Idempotent: every CREATE / ALTER uses IF [NOT] EXISTS. The backfill
-- block checks for items lacking a watchlist_id before doing anything, so
-- re-running this against a finished migration is a no-op.

BEGIN;

-- ─── 1. watchlists table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watchlists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS watchlists_user_idx
  ON watchlists (user_id);

-- Exactly one default per user. Partial unique index so non-defaults can
-- coexist freely. The API enforces "demote-then-promote" inside a tx, but
-- this constraint is the database-level safety net.
CREATE UNIQUE INDEX IF NOT EXISTS watchlists_user_default_uniq
  ON watchlists (user_id) WHERE is_default = true;

-- ─── 2. watchlist_items.watchlist_id ───────────────────────────────
-- Add nullable first, backfill, then enforce NOT NULL. This keeps the
-- statement reversible mid-run if backfill fails — the old (user_id, symbol)
-- access path still works because watchlist_id is nullable.
ALTER TABLE watchlist_items
  ADD COLUMN IF NOT EXISTS watchlist_id uuid REFERENCES watchlists(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS watchlist_items_watchlist_idx
  ON watchlist_items (watchlist_id);

-- ─── 3. Backfill — create a "Default" watchlist per user with items ──
-- For every user with at least one watchlist_item, create a Default
-- watchlist (if they don't already have one) and link all their orphaned
-- items to it. The DO block keeps this idempotent: only runs the
-- insert/update if there are still items missing a watchlist_id.
DO $$
DECLARE
  orphan_count int;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM watchlist_items
  WHERE watchlist_id IS NULL;

  IF orphan_count > 0 THEN
    -- Create a Default list for every user who has orphaned items and
    -- doesn't already have a default.
    INSERT INTO watchlists (user_id, name, is_default)
    SELECT DISTINCT wi.user_id, 'Default', true
    FROM watchlist_items wi
    WHERE wi.watchlist_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM watchlists w
        WHERE w.user_id = wi.user_id AND w.is_default = true
      );

    -- Link every orphaned item to its owner's default list.
    UPDATE watchlist_items wi
    SET watchlist_id = (
      SELECT w.id FROM watchlists w
      WHERE w.user_id = wi.user_id AND w.is_default = true
      LIMIT 1
    )
    WHERE wi.watchlist_id IS NULL;
  END IF;
END$$;

-- ─── 4. Enforce NOT NULL now that backfill is complete ─────────────
-- Wrapped in a DO block so re-running this section when the column is
-- already NOT NULL is silent (PG raises feature_not_supported otherwise).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'watchlist_items'
      AND column_name = 'watchlist_id'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE watchlist_items
      ALTER COLUMN watchlist_id SET NOT NULL;
  END IF;
END$$;

-- ─── 5. Swap unique constraint: (user_id, symbol) → (watchlist_id, symbol) ─
-- Drop the old per-user uniqueness so the same symbol can live in multiple
-- lists for the same user. The new constraint scopes uniqueness to the list.
DROP INDEX IF EXISTS watchlist_user_symbol_idx;

CREATE UNIQUE INDEX IF NOT EXISTS watchlist_items_list_symbol_uniq
  ON watchlist_items (watchlist_id, symbol);

COMMIT;
