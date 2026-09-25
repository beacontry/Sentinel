-- 0054_forum_category_unique_name.sql
-- One forum board per name (2026-09-23).
--
-- GET /api/forum/categories and POST /api/forum/seed seed the nine default
-- boards when forum_categories is empty. Both counted and then inserted, and
-- nothing constrained name, so two concurrent first loads (in practice, right
-- after a database reset) could each insert all nine and leave every board
-- twice, with new threads split across the copies. Both routes now insert
-- with ON CONFLICT (name) DO NOTHING against this index.
--
-- Step 1 collapses duplicates. For each name it keeps the oldest board
-- (created_at, then id), moves the other copies' threads onto it, then
-- deletes the copies. The move comes first on purpose: forum_threads
-- .category_id is ON DELETE CASCADE, so deleting a copy with threads still on
-- it would delete those threads and their replies. Nothing is touched unless
-- a name appears twice. To see them before applying:
--
--   SELECT name, count(*) FROM forum_categories
--   GROUP BY name HAVING count(*) > 1;
--
-- Step 2 creates the unique index.
--
-- Idempotent: a second run finds no duplicates and the index already exists.
-- Apply as postgres, then verify the index is present:
--
--   SELECT indexdef FROM pg_indexes
--   WHERE indexname = 'forum_categories_name_idx';

BEGIN;

CREATE TEMP TABLE forum_category_dupes ON COMMIT DROP AS
SELECT id AS dupe_id, keep_id
FROM (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY name
      ORDER BY created_at, id
    ) AS keep_id
  FROM forum_categories
) ranked
WHERE id <> keep_id;

UPDATE forum_threads t
SET category_id = d.keep_id
FROM forum_category_dupes d
WHERE t.category_id = d.dupe_id;

DELETE FROM forum_categories c
USING forum_category_dupes d
WHERE c.id = d.dupe_id;

CREATE UNIQUE INDEX IF NOT EXISTS forum_categories_name_idx
  ON forum_categories (name);

COMMIT;
