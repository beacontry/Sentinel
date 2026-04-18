import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  contextData: jsonb("context_data"),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("chat_messages_user_idx").on(t.userId),
  index("chat_messages_session_idx").on(t.sessionId),
  index("chat_messages_created_idx").on(t.createdAt),
]);

export const marketDigests = pgTable("market_digests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  date: text("date").notNull(),
  summary: text("summary").notNull(),
  watchlistSymbols: jsonb("watchlist_symbols"),
  newsContext: jsonb("news_context"),
  signalContext: jsonb("signal_context"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("market_digests_date_idx").on(t.date),
  index("market_digests_created_idx").on(t.createdAt),
]);
