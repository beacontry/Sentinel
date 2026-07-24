import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  real,
  boolean,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const optimizationRuns = pgTable("optimization_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  targetMetric: text("target_metric").notNull().default("total_return"),
  universe: text("universe").notNull().default("sp500"),

  // GA config
  populationSize: integer("population_size").notNull().default(30),
  generations: integer("generations").notNull().default(25),
  trainPct: integer("train_pct").notNull().default(60),

  // Progress
  currentGeneration: integer("current_generation").default(0),
  symbolsFetched: integer("symbols_fetched").default(0),
  totalSymbols: integer("total_symbols").default(0),

  // Results
  bestParams: jsonb("best_params"),
  bestTrainReturn: real("best_train_return"),
  bestTestReturn: real("best_test_return"),
  baselineTrainReturn: real("baseline_train_return"),
  baselineTestReturn: real("baseline_test_return"),
  trainSharpe: real("train_sharpe"),
  testSharpe: real("test_sharpe"),
  trainMaxDrawdown: real("train_max_drawdown"),
  testMaxDrawdown: real("test_max_drawdown"),
  // Test-segment activity (for the mode comparison's Optimized row, which
  // reads stored OOS metrics rather than re-simulating). Migration 0045.
  testTradeCount: integer("test_trade_count"),
  testAvgPositions: real("test_avg_positions"),

  // Active preset — only one run should be active at a time
  isActive: boolean("is_active").default(false),

  // Auto-optimizer decision marker (migration 0048). Set once the
  // /api/cron/auto-optimize evaluator has decided promote-or-keep for a
  // completed run, so it isn't re-evaluated every tick. NULL = not yet decided
  // (or manually promoted / pre-feature). See the OPTIMIZER_AUTO_* audit rows.
  autoPromotionDecidedAt: timestamp("auto_promotion_decided_at", { withTimezone: true }),

  // Timing
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  error: text("error"),
}, (t) => [
  index("optimization_runs_user_idx").on(t.userId),
]);

export const optimizationGenerations = pgTable("optimization_generations", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => optimizationRuns.id, { onDelete: "cascade" }),
  generation: integer("generation").notNull(),
  bestFitness: real("best_fitness").notNull(),
  avgFitness: real("avg_fitness").notNull(),
  worstFitness: real("worst_fitness").notNull(),
  bestParams: jsonb("best_params").notNull(),
  diversity: real("diversity"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("optimization_generations_run_idx").on(t.runId),
]);

export const optimizationSymbolResults = pgTable("optimization_symbol_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => optimizationRuns.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  totalReturn: real("total_return").notNull(),
  sharpeRatio: real("sharpe_ratio"),
  maxDrawdown: real("max_drawdown"),
  winRate: real("win_rate"),
  tradeCount: integer("trade_count"),
  trainReturn: real("train_return"),
  testReturn: real("test_return"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("optimization_symbol_results_run_idx").on(t.runId),
]);
