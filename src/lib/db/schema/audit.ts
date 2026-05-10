import { pgTable, bigserial, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Append-only, hash-chained audit log.
 *
 * Each row's `hash` is sha256(prevHash || createdAtISO || actorUserId ||
 * action || resourceType || resourceId || canonicalJson(metadata)).
 *
 * Writes acquire a PG advisory lock inside a transaction so concurrent
 * writers serialize and the chain stays linear.
 *
 * `actor_user_id` uses ON DELETE SET NULL — deleting a user must NOT
 * destroy the audit trail of their actions.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: text("actor_email"), // captured at write-time so deleted users still trace
    actorRole: text("actor_role"),
    action: text("action").notNull(), // e.g. "broker.connection.created", "engine.started"
    resourceType: text("resource_type"), // e.g. "broker_connection", "engine", "order"
    resourceId: text("resource_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
  },
  (t) => [
    index("audit_log_actor_idx").on(t.actorUserId),
    index("audit_log_action_idx").on(t.action),
    index("audit_log_resource_idx").on(t.resourceType, t.resourceId),
    index("audit_log_created_at_idx").on(t.createdAt),
  ]
);
