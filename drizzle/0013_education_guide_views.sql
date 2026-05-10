-- Per-user view tracking for the education guides section
-- (/dashboard/education/guides). Guides are authored as TS data in
-- src/lib/education/guides-data.ts, so we identify them by slug — no FK to a
-- guides table.
--
-- Idempotent: safe to run twice on the same DB and once on a fresh DB.

CREATE TABLE IF NOT EXISTS "education_guide_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "first_viewed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_viewed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "view_count" integer NOT NULL DEFAULT 1,
  "bookmarked" boolean NOT NULL DEFAULT false
);
--> statement-breakpoint

-- Hot query: list guides this user has viewed (progress sidebar / index badges).
CREATE INDEX IF NOT EXISTS "education_guide_views_user_idx"
  ON "education_guide_views" ("user_id");
--> statement-breakpoint

-- Natural key — one row per (user, slug). Upsert target for view recording.
CREATE UNIQUE INDEX IF NOT EXISTS "education_guide_views_user_slug_idx"
  ON "education_guide_views" ("user_id", "slug");
