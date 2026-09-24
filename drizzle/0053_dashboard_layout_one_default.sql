-- 0053_dashboard_layout_one_default.sql
-- At most one default dashboard layout per user (2026-09-23).
--
-- The layout PUT (dashboard autosave) selected the user's is_default row and
-- inserted one when none existed, and POST /api/dashboard/layouts demoted the
-- current default and inserted a new one. Nothing in the table stopped two
-- concurrent saves from both inserting a default, and the default-layout read
-- used LIMIT 1 with no ORDER BY, so a user with two defaults saw them flip
-- between loads. The PUT is now INSERT ... ON CONFLICT DO UPDATE against this
-- index, every writer that moves the default takes a per-user advisory lock,
-- and the read orders by created_at DESC, id DESC.
--
-- Step 1 demotes duplicate defaults. It keeps the row the read picks after
-- this change (newest created_at, then highest id) and turns the others into
-- ordinary saved layouts: nothing is deleted. Nothing is touched unless a user
-- has two or more defaults. To see them before applying:
--
--   SELECT user_id, count(*) FROM dashboard_layouts
--   WHERE is_default GROUP BY user_id HAVING count(*) > 1;
--
-- Step 2 creates the partial unique index.
--
-- Idempotent: a second run demotes nothing and the index already exists.
-- Apply as postgres, then verify the index is present:
--
--   SELECT indexdef FROM pg_indexes
--   WHERE indexname = 'dashboard_layouts_one_default_idx';

BEGIN;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM dashboard_layouts
  WHERE is_default
)
UPDATE dashboard_layouts d
SET is_default = false
FROM ranked r
WHERE d.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS dashboard_layouts_one_default_idx
  ON dashboard_layouts (user_id)
  WHERE is_default;

COMMIT;
