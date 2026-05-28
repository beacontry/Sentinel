-- 0043_forum_replies_parent_fk.sql
-- Add the missing self-referential FK on forum_replies.parent_reply_id.
--
-- parent_reply_id pointed at forum_replies.id but had NO foreign-key
-- constraint — only a plain index. Deleting a parent reply left its children
-- pointing at a now-nonexistent row (dangling pointer / orphaned thread).
--
-- ON DELETE SET NULL (not CASCADE): deleting a parent reply promotes its
-- children to top-level rather than silently deleting the whole subtree —
-- preserves user-generated content. parent_reply_id is already nullable.
--
-- Idempotent: orphan cleanup is a no-op once clean; the constraint add is
-- guarded by a catalog check.

-- 1. Null out any pre-existing orphans so the FK can be validated.
UPDATE forum_replies
SET parent_reply_id = NULL
WHERE parent_reply_id IS NOT NULL
  AND parent_reply_id NOT IN (SELECT id FROM forum_replies);

-- 2. Add the FK if it doesn't already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'forum_replies_parent_reply_id_fk'
  ) THEN
    ALTER TABLE forum_replies
      ADD CONSTRAINT forum_replies_parent_reply_id_fk
      FOREIGN KEY (parent_reply_id) REFERENCES forum_replies(id) ON DELETE SET NULL;
  END IF;
END $$;
