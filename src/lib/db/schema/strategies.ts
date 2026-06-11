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
  // Phase 4 — engine intelligence (2026-05-12)
  /** Max % of equity in any single sector. NULL = disabled. e.g. 0.25 → refuse BUYs when sector >25% of equity. */
  maxSectorExposurePct: real("max_sector_exposure_pct"),
  /** Auto-swap engine mode based on VIX + SPY trend. Defaults false. */
  adaptiveModeEnabled: boolean("adaptive_mode_enabled").notNull().default(false),
  /** Block BUYs within N trading days of a symbol's earnings release. NULL = disabled. */
  earningsBlackoutDays: integer("earnings_blackout_days"),
  // Delayed-trail activation (post-2026-06-11 review). NULL/0 = legacy
  // always-active trail. Recommended starting value 0.05 (5%) per the
  // robustness sweep — beats baseline on admin's loser universe in 4/5
  // period slices and on random S&P in 5/5 (small but positive). Fixed
  // disaster stop + breakeven ladder are unaffected; only the trailing
  // stop activation is delayed.
  /** Peak price must rise this fraction above entry before the trail engages. NULL = 0 = always-on. */
  trailActivationProfitPct: real("trail_activation_profit_pct"),
  /** Position must age this many trading days before the trail engages. NULL = 0 = always-on. */
  trailActivationBars: integer("trail_activation_bars"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("risk_profiles_user_idx").on(t.userId),
]);
