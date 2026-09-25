-- 0049_single_active_broker_connection.sql
-- At most one active broker connection per user (2026-09-23).
--
-- POST /api/broker/connections inserted every new row active and PATCH could
-- set is_active directly, so a user could hold a paper and a live connection
-- active at once. The engine resolver preferred paper, while manual orders and
-- flatten took `LIMIT 1` with no ORDER BY, so they could act on the other
-- account. The code now inserts later connections inactive, switches only
-- through /activate, and resolves every caller through one resolver. This
-- makes the rule a database invariant.
--
-- Step 1 demotes duplicates, keeping the row the engine resolver picks today:
-- paper first, then the oldest, then the lowest id (the same order as
-- pickActiveConnection in src/lib/broker-connection.ts). A user whose engine
-- runs on paper keeps running on paper. Only users with two or more active
-- rows are touched. To see who they are before applying:
--
--   SELECT user_id, count(*) FROM broker_connections
--   WHERE is_active GROUP BY user_id HAVING count(*) > 1;
--
-- Step 2 creates the partial unique index. The /activate route demotes the
-- others before it promotes the target in one transaction, so it never holds
-- two active rows at a statement boundary.
--
-- Idempotent: a second run demotes nothing and the index already exists.
-- Apply as postgres, then verify the index is present:
--
--   SELECT indexdef FROM pg_indexes
--   WHERE indexname = 'broker_connections_one_active_per_user_idx';

BEGIN;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY (environment = 'paper') DESC, created_at ASC, id ASC
    ) AS rn
  FROM broker_connections
  WHERE is_active
)
UPDATE broker_connections b
SET is_active = false, updated_at = now()
FROM ranked r
WHERE b.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS broker_connections_one_active_per_user_idx
  ON broker_connections (user_id)
  WHERE is_active;

COMMIT;
