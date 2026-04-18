import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const brokerConnections = pgTable("broker_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  broker: text("broker").notNull(), // "alpaca", "ibkr", "tradier"
  label: text("label").notNull().default("Default"),
  apiKey: text("api_key").notNull(), // TODO: encrypt at rest (AES-256-GCM)
  apiSecret: text("api_secret").notNull(), // TODO: encrypt at rest (AES-256-GCM)
  environment: text("environment").notNull().default("paper"), // "paper" or "live"
  isActive: boolean("is_active").notNull().default(true),
  lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("broker_connections_user_id_idx").on(t.userId),
  uniqueIndex("broker_connections_user_broker_env_idx").on(t.userId, t.broker, t.environment),
]);
