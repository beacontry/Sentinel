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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("signals_symbol_idx").on(t.symbol),
  index("signals_created_idx").on(t.createdAt),
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
