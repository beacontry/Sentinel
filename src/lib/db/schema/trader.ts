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

export const traderSignals = pgTable("trader_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  symbol: text("symbol").notNull(),
  signal: text("signal").notNull(),
  price: real("price").notNull(),
  volume: integer("volume").notNull(),
  indicators: jsonb("indicators").notNull(),
  actedOn: boolean("acted_on").notNull().default(false),
  traderTimestamp: timestamp("trader_timestamp", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("trader_signals_symbol_idx").on(t.symbol),
  index("trader_signals_created_idx").on(t.createdAt),
  index("trader_signals_user_idx").on(t.userId),
  index("trader_signals_user_created_idx").on(t.userId, t.createdAt),
]);

export const traderTrades = pgTable("trader_trades", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  traderId: integer("trader_id"),
  brokerOrderId: text("broker_order_id"),
  signalId: uuid("signal_id"),
  symbol: text("symbol").notNull(),
  signal: text("signal").notNull(),
  action: text("action").notNull(),
  quantity: integer("quantity").notNull(),
  orderType: text("order_type").notNull(),
  limitPrice: real("limit_price"),
  stopPrice: real("stop_price"),
  fillPrice: real("fill_price"),
  // Phase 16 — engine's expected fill price at submission. fillPrice gets
  // updated by the Phase 11 reconciler with actual broker fill; placeholder
  // preserves the original so slippage = fillPrice - placeholderFillPrice.
  placeholderFillPrice: real("placeholder_fill_price"),
  fillTime: timestamp("fill_time", { withTimezone: true }),
  status: text("status").notNull().default("PENDING"),
  pnl: real("pnl"),
  notes: text("notes"),
  traderTimestamp: timestamp("trader_timestamp", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("trader_trades_symbol_idx").on(t.symbol),
  index("trader_trades_status_idx").on(t.status),
  index("trader_trades_created_idx").on(t.createdAt),
  index("trader_trades_user_idx").on(t.userId),
  index("trader_trades_broker_order_idx").on(t.brokerOrderId),
  index("trader_trades_user_created_idx").on(t.userId, t.createdAt),
  uniqueIndex("trader_trades_user_broker_order_idx").on(t.userId, t.brokerOrderId),
]);

export const traderDailyPnl = pgTable("trader_daily_pnl", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  date: text("date").notNull(),
  realizedPnl: real("realized_pnl").notNull().default(0),
  unrealizedPnl: real("unrealized_pnl").notNull().default(0),
  tradesCount: integer("trades_count").notNull().default(0),
  halted: boolean("halted").notNull().default(false),
  haltReason: text("halt_reason"),
  engineMode: text("engine_mode"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("trader_daily_pnl_date_user_idx").on(t.date, t.userId),
]);

export const traderPositions = pgTable("trader_positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  symbol: text("symbol").notNull(),
  quantity: integer("quantity").notNull(),
  entryPrice: real("entry_price").notNull(),
  currentPrice: real("current_price").notNull(),
  unrealizedPnl: real("unrealized_pnl").notNull(),
  stopPrice: real("stop_price"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("trader_positions_symbol_user_idx").on(t.symbol, t.userId),
]);

export const traderStatus = pgTable("trader_status", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  connected: boolean("connected").notNull().default(true),
  mode: text("mode").notNull().default("paper"),
  lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }).defaultNow().notNull(),
  watchlist: jsonb("watchlist").notNull().default([]),
});

// Engine watchdog alerts: stalls, broker disconnects, daily-loss approaches, exit-order failures.
// Written by src/lib/engine-watchdog.ts every 60s when conditions hit. Severity 'error' triggers
// a push notification via sendPushToUser().
export const engineAlerts = pgTable("engine_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(), // 'stall' | 'broker_disconnect' | 'daily_loss_warn' | 'exit_order_failed'
  severity: text("severity").notNull(), // 'warn' | 'error'
  message: text("message").notNull(),
  context: jsonb("context"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
}, (t) => [
  index("engine_alerts_user_created_idx").on(t.userId, t.createdAt),
  index("engine_alerts_user_kind_created_idx").on(t.userId, t.kind, t.createdAt),
]);
