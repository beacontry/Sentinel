-- 0040_trader_engine_snapshot.sql
-- PR 21b (2026-05-26): persist engine in-memory state across reboots.
--
-- Until PR 21b, only `mode` survived a deploy/restart (read from
-- trader_status). Position map, ATR history, daily-notional counter,
-- consecutive-loss count, PDT suppression state, boot equity, and
-- per-symbol cooldowns were all lost on reboot, forcing the engine to
-- re-derive everything from the broker (slow + caused a few minutes of
-- "stale stop" exposure right after each deploy).
--
-- This table holds one JSONB blob per user that is written at the end of
-- every successful runScan and hydrated in autoStartIfNeeded if the
-- snapshot is younger than SNAPSHOT_MAX_AGE_MS (currently 60 min).
--
-- Storage: ~1 KB/user/scan, ~1 write/15 min. Trivial DB load even at
-- 1000 active engines.
--
-- Idempotent (IF NOT EXISTS on table + index).

CREATE TABLE IF NOT EXISTS trader_engine_snapshot (
  user_id     TEXT PRIMARY KEY,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload     JSONB NOT NULL
);

-- snapshot_at index supports a "find stale snapshots to discard" sweep
-- if we ever add a janitor cron. Not needed today; index is cheap.
CREATE INDEX IF NOT EXISTS trader_engine_snapshot_at_idx
  ON trader_engine_snapshot (snapshot_at);
