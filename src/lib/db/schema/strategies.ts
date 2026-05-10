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
import { users } from "./users";

export const savedStrategies = pgTable("saved_strategies", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  config: jsonb("config").notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastResult: jsonb("last_result"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("strategies_user_idx").on(t.userId),
]);

export const symbolStrategies = pgTable("symbol_strategies", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  presetName: text("preset_name"),
  stopLossPct: real("stop_loss_pct").notNull(),
  takeProfitPct: real("take_profit_pct").notNull(),
  trailingStopPct: real("trailing_stop_pct").notNull(),
  holdPeriod: integer("hold_period").notNull(),
  atrTuned: boolean("atr_tuned").notNull().default(false),
  lastAtr: real("last_atr"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("symbol_strategies_user_idx").on(t.userId),
  uniqueIndex("symbol_strategies_user_symbol_idx").on(t.userId, t.symbol),
]);

export const userRiskProfiles = pgTable("user_risk_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountSize: real("account_size"),
  maxDailyLossPct: real("max_daily_loss_pct"),
  maxDrawdownPct: real("max_drawdown_pct"),
  riskTolerance: text("risk_tolerance"),
  maxPositionPct: real("max_position_pct"),
  maxPositionSize: integer("max_position_size"),
  maxSingleTradeLoss: real("max_single_trade_loss"),
  maxExposureMultiplier: real("max_exposure_multiplier"),
  // Live-trading safeguards (Phase 3)
  maxDailyNotionalPct: real("max_daily_notional_pct"), // fraction (0.5 = 50% of equity)
  maxConsecutiveLosses: integer("max_consecutive_losses"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("risk_profiles_user_idx").on(t.userId),
]);
