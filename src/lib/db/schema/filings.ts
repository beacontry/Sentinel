import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const secFilings = pgTable("sec_filings", {
  id: uuid("id").primaryKey().defaultRandom(),
  symbol: text("symbol").notNull(),
  filingType: text("filing_type").notNull(),
  filedAt: timestamp("filed_at", { withTimezone: true }).notNull(),
  url: text("url").notNull(),
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("sec_filings_symbol_idx").on(t.symbol),
  index("sec_filings_type_idx").on(t.filingType),
  index("sec_filings_filed_idx").on(t.filedAt),
]);

export const filingChatSessions = pgTable("filing_chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  filingId: uuid("filing_id").notNull().references(() => secFilings.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("filing_chat_user_idx").on(t.userId),
  index("filing_chat_filing_idx").on(t.filingId),
]);
