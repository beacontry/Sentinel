import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  real,
  boolean,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const signals = pgTable("signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  symbol: text("symbol").notNull(),
  signal: text("signal").notNull(),
  confidence: real("confidence").notNull(),
  price: real("price").notNull(),
  volume: integer("volume").notNull(),
  plainEnglish: text("plain_english").notNull(),
  indicators: jsonb("indicators").notNull(),
  timeframe: text("timeframe"),
  // Last analyzed bar, set by GET /api/analyze/[symbol] so a repeat view of
  // the same bar inserts nothing (migration 0052). NULL for other writers.
  barTime: timestamp("bar_time", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("signals_symbol_idx").on(t.symbol),
  index("signals_created_idx").on(t.createdAt),
  uniqueIndex("signals_symbol_timeframe_bar_idx")
    .on(t.symbol, t.timeframe, t.barTime)
    .where(sql`bar_time IS NOT NULL`),
]);

export const signalAccuracy = pgTable("signal_accuracy", {
  id: uuid("id").primaryKey().defaultRandom(),
  signalId: uuid("signal_id").notNull().references(() => signals.id, { onDelete: "cascade" }),
  entryPrice: real("entry_price").notNull(),
  exitPrice: real("exit_price"),
  actualReturn: real("actual_return"),
  timeframe: text("timeframe"),
  checkHours: integer("check_hours").default(24),
  wasCorrect: boolean("was_correct"),
  measuredAt: timestamp("measured_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("accuracy_signal_idx").on(t.signalId),
]);
