import {
  pgTable,
  text,
  timestamp,
  uuid,
  real,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const alertRules = pgTable("alert_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  indicatorField: text("indicator_field").notNull(),
  operator: text("operator").notNull(),
  value: real("value").notNull(),
  channel: text("channel").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastTriggered: timestamp("last_triggered", { withTimezone: true }),
  // Edge-triggering: the condition's value at the last evaluation. The rule
  // fires only on the false→true transition (migration 0044), so crossover/
  // threshold rules signal the actual cross, not "still true since days ago".
  lastConditionMet: boolean("last_condition_met").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("alert_rules_user_idx").on(t.userId),
  index("alert_rules_symbol_idx").on(t.symbol),
]);

export const alertHistory = pgTable("alert_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleId: uuid("rule_id").notNull().references(() => alertRules.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("alert_history_rule_idx").on(t.ruleId),
  index("alert_history_triggered_idx").on(t.triggeredAt),
]);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("push_sub_user_idx").on(t.userId),
  uniqueIndex("push_sub_endpoint_idx").on(t.endpoint),
]);
