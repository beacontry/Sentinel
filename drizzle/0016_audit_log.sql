-- Append-only, hash-chained audit log.
--
-- Each row's hash = sha256(prevHash || createdAtISO || actorUserId ||
-- action || resourceType || resourceId || canonicalJSON(metadata)).
-- Writes serialize via pg_advisory_xact_lock(8493920100) so concurrent
-- writers can't fork the chain. See src/lib/audit.ts for the helper.
--
-- actor_user_id ON DELETE SET NULL — deleting a user must NOT destroy
-- the audit trail of their actions. actor_email is captured at write
-- time so deleted users remain traceable.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" bigserial PRIMARY KEY,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "actor_email" text,
  "actor_role" text,
  "action" text NOT NULL,
  "resource_type" text,
  "resource_id" text,
  "ip" text,
  "user_agent" text,
  "metadata" jsonb,
  "prev_hash" text NOT NULL,
  "hash" text NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "audit_log_actor_idx"
  ON "audit_log" ("actor_user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "audit_log_action_idx"
  ON "audit_log" ("action");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "audit_log_resource_idx"
  ON "audit_log" ("resource_type", "resource_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx"
  ON "audit_log" ("created_at");
