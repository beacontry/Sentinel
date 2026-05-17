import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

// Non-secret server-wide configuration (feature flags, toggles).
// Sibling of system_config (which holds encrypted API keys).
//
// Plaintext values are fine here — no encryption overhead, and the values
// are operational booleans that don't need to be hidden from a future
// admin who pulls a dump.
//
// Helpers live in src/lib/app-settings.ts. Known keys allow-listed in
// code (`KNOWN_KEYS`); admins can't write arbitrary keys.
export const appSettings = pgTable(
  "app_settings",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("app_settings_updated_at_idx").on(t.updatedAt)]
);
