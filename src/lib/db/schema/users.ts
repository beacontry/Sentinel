import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  bio: text("bio"),
  role: text("role").notNull().default("user"),
  pinHash: text("pin_hash"),
  emailNotifications: boolean("email_notifications").default(false),
  notificationEmail: text("notification_email"),
  timezone: text("timezone"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("users_email_idx").on(t.email),
]);

export const userPreferences = pgTable("user_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dashboardLayoutId: uuid("dashboard_layout_id"),
  language: text("language").notNull().default("en"),
  feedConfigs: jsonb("feed_configs"),
}, (t) => [
  uniqueIndex("user_preferences_user_idx").on(t.userId),
]);
