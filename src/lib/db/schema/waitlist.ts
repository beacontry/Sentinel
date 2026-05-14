// Public landing-page waitlist signups. See drizzle/0034_waitlist.sql.

import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";

export const waitlist = pgTable(
  "waitlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    source: text("source"),
    userAgent: text("user_agent"),
    ip: text("ip"),
    notes: text("notes"),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Case-insensitive uniqueness is enforced via the LOWER(email) functional
    // index in the migration. Drizzle can't model functional indexes; just the
    // descending time index here.
    index("waitlist_created_idx").on(t.createdAt),
  ]
);
