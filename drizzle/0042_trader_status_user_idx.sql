-- 0042_trader_status_user_idx.sql
-- Add the missing btree index on trader_status.user_id.
--
-- trader_status is queried by user_id on every dashboard load
-- (/api/trader/dashboard) and on every engine boot + heartbeat write
-- (trading-engine.ts). With no index this was a seq scan per user per scan.
-- Every other per-user table indexes its userId; this one was overlooked
-- when user_id was added (0003).
--
-- Idempotent (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS trader_status_user_id_idx
  ON trader_status (user_id);
