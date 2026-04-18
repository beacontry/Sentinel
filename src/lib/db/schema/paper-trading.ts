import {
  pgTable,
  timestamp,
  uuid,
  text,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const paperTradingConfigs = pgTable("paper_trading_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  strategyConfig: jsonb("strategy_config").notNull(),
  riskConfig: jsonb("risk_config").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("paper_trading_configs_user_idx").on(t.userId),
]);

export const paperTradingRuns = pgTable("paper_trading_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  configId: uuid("config_id").notNull().references(() => paperTradingConfigs.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  results: jsonb("results"),
}, (t) => [
  index("paper_trading_runs_config_idx").on(t.configId),
]);
