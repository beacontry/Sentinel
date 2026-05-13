import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  date,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { portfolioTrades } from "./portfolio";
import { traderTrades } from "./trader";

/**
 * trade_journal — user-authored notes about trades AND auto-generated
 * stubs / prompts. The `type` column distinguishes them:
 *
 *   - manual        — user wrote it (default, original entries)
 *   - auto-trade    — engine created a stub when a trade filled; user
 *                     fills in the WHY. Pre-filled with symbol, P&L,
 *                     signal context. (Phase 1)
 *   - pre-market    — daily 8:30 ET prompt ("what's the plan?") (Phase 2)
 *   - post-market   — daily 4:30 ET prompt ("what worked?") (Phase 2)
 *   - weekly-review — AI-summarized Sunday recap (Phase 2)
 *
 * `prompt_date` is set on daily/weekly entries so a partial unique index
 * (in the migration) prevents duplicate prompts on the same day for the
 * same user.
 *
 * Auto-trade stubs use a separate partial unique index on
 * (user_id, trader_trade_id) so the engine can safely re-run
 * reconciliation without ever creating duplicates.
 */
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
  /** Journal-entry type — see comment above. Defaults to "manual" so existing rows are unaffected. */
  type: text("type").notNull().default("manual"),
  /** YYYY-MM-DD for daily/weekly prompts (one per user/type/date). */
  promptDate: date("prompt_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("journal_user_idx").on(t.userId),
  index("journal_symbol_idx").on(t.symbol),
  index("journal_created_idx").on(t.createdAt),
  index("journal_portfolio_trade_idx").on(t.portfolioTradeId),
  index("journal_trader_trade_idx").on(t.traderTradeId),
  index("journal_type_idx").on(t.type),
]);
