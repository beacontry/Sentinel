import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { portfolioTrades } from "./portfolio";
import { traderTrades } from "./trader";

export const tradeJournal = pgTable("trade_journal", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  title: text("title").notNull(),
  notes: text("notes").notNull(),
  tags: jsonb("tags").notNull().default([]),
  mood: text("mood"),
  rating: integer("rating"),
  portfolioTradeId: uuid("portfolio_trade_id").references(() => portfolioTrades.id, { onDelete: "set null" }),
  traderTradeId: uuid("trader_trade_id").references(() => traderTrades.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("journal_user_idx").on(t.userId),
  index("journal_symbol_idx").on(t.symbol),
  index("journal_created_idx").on(t.createdAt),
  index("journal_portfolio_trade_idx").on(t.portfolioTradeId),
  index("journal_trader_trade_idx").on(t.traderTradeId),
]);
