import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

// Server-wide encrypted configuration. One row per (env-var-name) key.
// Values are AES-256-GCM ciphertext (iv:cipher:tag); never store plaintext.
// Helpers live in src/lib/system-config.ts.
export const systemConfig = pgTable(
  "system_config",
  {
    key: text("key").primaryKey(),
    valueEncrypted: text("value_encrypted").notNull(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("system_config_updated_at_idx").on(t.updatedAt)]
);
