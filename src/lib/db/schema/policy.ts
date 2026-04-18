import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  jsonb,
} from "drizzle-orm/pg-core";

export const policyItems = pgTable("policy_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  summary: text("summary"),
  affectedSectors: jsonb("affected_sectors"),
  sourceUrl: text("source_url"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("policy_items_status_idx").on(t.status),
]);
