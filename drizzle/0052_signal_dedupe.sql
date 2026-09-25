-- 0052_signal_dedupe.sql
-- One analyze signal per symbol, resolution and bar (2026-09-23).
--
-- GET /api/analyze/[symbol] persisted a signals row and a signal_accuracy
-- placeholder on every call, and fired the caller's Discord webhooks and the
-- trader push each time. The preview sheet, the screener modal and the
-- analysis page (one call per watchlist symbol) all call it just to show a
-- result, so the platform-wide accuracy stats and the leaderboard weighted a
-- symbol by how often someone looked at it, the accuracy cron spent one
-- upstream quote per duplicate, and Discord got the same signal on every view.
--
-- The route now writes bar_time (the timestamp of the last bar it analyzed)
-- and timeframe (5m or 1d), inserts with ON CONFLICT DO NOTHING, and runs the
-- accuracy insert and the notifications only when its row was the one
-- inserted. This index is what makes a repeat view of the same bar a no-op.
--
-- Existing rows keep bar_time NULL and are outside the partial index, so
-- creating it cannot fail on historical duplicates, and other writers that
-- leave bar_time unset (the feed's POST) are unaffected.
--
-- Idempotent. Apply as postgres, then verify:
--
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'signals' AND column_name = 'bar_time';
--   SELECT indexdef FROM pg_indexes WHERE indexname = 'signals_symbol_timeframe_bar_idx';

BEGIN;

ALTER TABLE signals ADD COLUMN IF NOT EXISTS bar_time TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS signals_symbol_timeframe_bar_idx
  ON signals (symbol, timeframe, bar_time)
  WHERE bar_time IS NOT NULL;

COMMIT;
