-- 0050_single_active_optimization_run.sql
-- At most one active optimization run, globally (2026-09-23).
--
-- The active preset is one GLOBAL slot: every optimized-mode engine loads
-- `status = 'complete' AND is_active LIMIT 1`. Two writers flip it. save-preset
-- ran its demote and promote as two statements outside a transaction, and the
-- auto-optimize cron demoted every active row after minutes of scoring without
-- re-checking the incumbent. Interleaved, they could leave two active rows, and
-- the engine then loaded whichever one Postgres returned. Both writers now flip
-- in one transaction (the cron fenced on the incumbent it scored), and every
-- reader orders deterministically. This makes the rule a database invariant.
--
-- Step 1 demotes duplicates. There is no activation timestamp, so it keeps the
-- row the readers pick after this change: complete first, then the latest
-- completed_at, then the highest id (the ORDER BY in the engine's
-- _loadOptimizedParams, the compare and mode-compare routes and the cron's
-- incumbent read). Nothing is touched unless two or more rows are active. To
-- see them before applying:
--
--   SELECT id, user_id, status, completed_at FROM optimization_runs
--   WHERE is_active ORDER BY completed_at DESC;
--
-- Step 2 creates the partial unique index on a constant, so the whole table can
-- hold one active row. Both writers demote before they promote inside one
-- transaction, so neither holds two active rows at a statement boundary.
--
-- Idempotent: a second run demotes nothing and the index already exists.
-- Apply as postgres, then verify the index is present:
--
--   SELECT indexdef FROM pg_indexes
--   WHERE indexname = 'optimization_runs_one_active_idx';

BEGIN;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      ORDER BY (status = 'complete') DESC, completed_at DESC, id DESC
    ) AS rn
  FROM optimization_runs
  WHERE is_active
)
UPDATE optimization_runs o
SET is_active = false
FROM ranked r
WHERE o.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS optimization_runs_one_active_idx
  ON optimization_runs ((true))
  WHERE is_active;

COMMIT;
