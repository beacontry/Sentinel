-- Two new tables for education v3:
--
-- 1. glossary_review_state — per-user spaced-repetition (SM-2 algorithm)
--    state for glossary terms. termId is a TEXT reference to glossary-data.ts
--    IDs (no FK — glossary lives in TS, not the DB).
--
-- 2. user_tax_status — per-user trader tax status (TTS) and §475(f) MTM
--    election declaration. Self-attestation only — we record what the user
--    claims, used to drive UI (badges, conditional warnings).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS — safe
-- to run twice on the same DB and once on a fresh DB.

CREATE TABLE IF NOT EXISTS "glossary_review_state" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "term_id" text NOT NULL,
  "ease_factor" integer NOT NULL DEFAULT 250,
  "interval_days" integer NOT NULL DEFAULT 0,
  "review_count" integer NOT NULL DEFAULT 0,
  "lapses" integer NOT NULL DEFAULT 0,
  "last_quality" integer,
  "last_reviewed_at" timestamp with time zone,
  "next_review_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "glossary_review_state_user_idx"
  ON "glossary_review_state" ("user_id");
--> statement-breakpoint

-- Hot query: due cards for user — order by next_review_at ASC, filter to
-- (user_id = ? AND next_review_at <= now()).
CREATE INDEX IF NOT EXISTS "glossary_review_state_user_due_idx"
  ON "glossary_review_state" ("user_id", "next_review_at");
--> statement-breakpoint

-- Natural key — one row per (user, term).
CREATE UNIQUE INDEX IF NOT EXISTS "glossary_review_state_user_term_idx"
  ON "glossary_review_state" ("user_id", "term_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_tax_status" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "has_trader_tax_status" boolean NOT NULL DEFAULT false,
  "mtm_election_year" integer,
  "mtm_declared_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- One row per user.
CREATE UNIQUE INDEX IF NOT EXISTS "user_tax_status_user_idx"
  ON "user_tax_status" ("user_id");
