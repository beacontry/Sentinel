-- Per-user quiz tracking for education guides. Adds four columns to the
-- existing education_guide_views table created in migration 0013.
--
-- - quiz_score / quiz_total: most-recent attempt (NULL until first submit)
-- - quiz_passed_at: first timestamp the user crossed the 80% threshold;
--   never overwritten on later attempts
-- - quiz_attempts: count of submissions, incremented on every POST
--
-- Idempotent: ADD COLUMN IF NOT EXISTS — safe to run twice on the same DB
-- and once on a fresh DB.

ALTER TABLE "education_guide_views"
  ADD COLUMN IF NOT EXISTS "quiz_score" integer;
--> statement-breakpoint

ALTER TABLE "education_guide_views"
  ADD COLUMN IF NOT EXISTS "quiz_total" integer;
--> statement-breakpoint

ALTER TABLE "education_guide_views"
  ADD COLUMN IF NOT EXISTS "quiz_passed_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "education_guide_views"
  ADD COLUMN IF NOT EXISTS "quiz_attempts" integer NOT NULL DEFAULT 0;
