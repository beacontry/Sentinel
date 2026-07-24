-- 0048_optimizer_auto_promotion.sql
-- Auto-optimizer decision marker (2026-07-23).
--
-- The auto-optimizer cron (/api/cron/auto-optimize) is stateful and idempotent:
-- it kicks off a GA run, then on a LATER invocation evaluates the completed run
-- (promote to the global active slot if its out-of-sample excess return beats
-- the incumbent by the configured margin, else keep the incumbent). This column
-- records that a completed run has already been through that promote/reject
-- decision, so the cron doesn't re-evaluate — and re-fetch the universe + re-run
-- two holdout backtests — on every subsequent tick.
--
-- NULL  = completed run not yet evaluated by the auto-optimizer (or a run that
--          predates this feature / was promoted manually via save-preset).
-- SET    = the auto-optimizer has decided (see the OPTIMIZER_AUTO_PROMOTED /
--          OPTIMIZER_AUTO_REJECTED audit rows for the outcome).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS is a no-op if already applied.
ALTER TABLE optimization_runs
  ADD COLUMN IF NOT EXISTS auto_promotion_decided_at timestamptz;
