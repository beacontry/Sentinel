import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const portfolios = pgTable("portfolios", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  initialBalance: real("initial_balance").notNull().default(10000),
  currentBalance: real("current_balance").notNull().default(10000),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("portfolios_user_idx").on(t.userId),
]);

export const portfolioPositions = pgTable("portfolio_positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  quantity: integer("quantity").notNull(),
  entryPrice: real("entry_price").notNull(),
  entryDate: timestamp("entry_date", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("ppositions_portfolio_idx").on(t.portfolioId),
  uniqueIndex("ppositions_portfolio_symbol_idx").on(t.portfolioId, t.symbol),
]);

export const portfolioTrades = pgTable("portfolio_trades", {
  id: uuid("id").primaryKey().defaultRandom(),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  action: text("action").notNull(), // 'BUY' or 'SELL'
  quantity: integer("quantity").notNull(),
  price: real("price").notNull(),
  executedAt: timestamp("executed_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("ptrades_portfolio_idx").on(t.portfolioId),
  index("ptrades_executed_idx").on(t.executedAt),
]);
