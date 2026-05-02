-- Engine watchdog: alert log for stalled engines, broker disconnects,
-- daily-loss approaches, and exit-order failures. Written every 60s by
-- src/lib/engine-watchdog.ts when conditions fire. The watchdog itself
-- dedups in code (skips writing the same kind for the same user within
-- 15 min) so we don't need a unique constraint here.
--
-- Idempotent: safe to run twice on the same DB and once on a fresh DB.

CREATE TABLE IF NOT EXISTS "engine_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL,
  "kind" text NOT NULL,
  "severity" text NOT NULL,
  "message" text NOT NULL,
  "context" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "acknowledged_at" timestamp with time zone
);
--> statement-breakpoint

-- Hot query: most recent alerts for a user (dashboard banner, watchdog dedup).
CREATE INDEX IF NOT EXISTS "engine_alerts_user_created_idx"
  ON "engine_alerts" ("user_id", "created_at" DESC);
--> statement-breakpoint

-- Hot query: most recent alert of a specific kind for a user (watchdog dedup
-- check — "did we already alert this user about a stall in the last 15 min?").
CREATE INDEX IF NOT EXISTS "engine_alerts_user_kind_created_idx"
  ON "engine_alerts" ("user_id", "kind", "created_at" DESC);
