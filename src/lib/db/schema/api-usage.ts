import { pgTable, serial, text, integer, bigint, timestamp, date, unique, index } from "drizzle-orm/pg-core";

// Daily aggregate of external-API consumption. One row per
// (date, provider). UPSERT on every call via src/lib/api-usage.ts
// helpers. Powers /dashboard/admin → API Usage card.
//
// Per-user attribution deferred — current schema is server-wide
// aggregate. Adding user_id later means a schema change + dropping
// the (date, provider) unique in favor of (date, provider, user_id).
export const apiUsageLog = pgTable(
  "api_usage_log",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    provider: text("provider").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    tokensUsed: bigint("tokens_used", { mode: "number" }).notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    firstAt: timestamp("first_at", { withTimezone: true }).defaultNow().notNull(),
    lastAt: timestamp("last_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("api_usage_log_date_provider_key").on(t.date, t.provider),
    index("api_usage_log_date_idx").on(t.date),
    index("api_usage_log_provider_date_idx").on(t.provider, t.date),
  ]
);
