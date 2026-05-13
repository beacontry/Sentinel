-- Journal v2 — phase 1: auto-stub on filled trades
--
-- Adds a `type` column to trade_journal so we can distinguish:
--   - manual         (default, user-authored — existing entries)
--   - auto-trade     (auto-generated stub when a trade fills; user fills in the WHY)
--   - pre-market     (Phase 2 — daily pre-market prompt at 8:30 ET)
--   - post-market    (Phase 2 — daily post-market prompt at 4:30 ET)
--   - weekly-review  (Phase 2 — AI-generated Sunday recap)
--
-- Adds `prompt_date` for daily/weekly entries so we can enforce one per
-- date per user (Phase 2 will use this to skip duplicates).
--
-- Adds a partial unique index on (user_id, trader_trade_id) WHERE
-- type='auto-trade' AND trader_trade_id IS NOT NULL — so the engine
-- can safely INSERT...ON CONFLICT DO NOTHING when a trade reconciles
-- repeatedly (we never want two auto-stubs for the same trade).
--
-- All idempotent: safe to re-run on a DB that already applied it.

ALTER TABLE trade_journal
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE trade_journal
  ADD COLUMN IF NOT EXISTS prompt_date DATE;

-- Unique index for auto-trade stubs: at most one per (user, trader_trade).
CREATE UNIQUE INDEX IF NOT EXISTS journal_auto_trade_uniq
  ON trade_journal (user_id, trader_trade_id)
  WHERE type = 'auto-trade' AND trader_trade_id IS NOT NULL;

-- Unique index for daily prompts: at most one per (user, type, date).
-- Phase 2 will use this for pre-market / post-market dedup.
CREATE UNIQUE INDEX IF NOT EXISTS journal_prompt_uniq
  ON trade_journal (user_id, type, prompt_date)
  WHERE prompt_date IS NOT NULL;

-- Helpful index for filtering by type (e.g. "show me all auto-stubs").
CREATE INDEX IF NOT EXISTS journal_type_idx ON trade_journal (type);
