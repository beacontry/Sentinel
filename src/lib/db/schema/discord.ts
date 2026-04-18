import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const discordWebhooks = pgTable("discord_webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  webhookUrl: text("webhook_url").notNull(),
  channelName: text("channel_name"),
  minSignalStrength: integer("min_signal_strength").notNull().default(1),
  symbols: jsonb("symbols").notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("webhooks_user_idx").on(t.userId),
]);
