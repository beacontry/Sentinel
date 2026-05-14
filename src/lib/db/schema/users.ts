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
  // Phase 6b — onboarding: NULL = first-time user, modal shown on next login.
  safeguardsAcknowledgedAt: timestamp("safeguards_acknowledged_at", { withTimezone: true }),
  // Phase 13 — per-user live-trading permission. Engine refuses live boot
  // when false even if ALLOW_LIVE_TRADING=1 is set on the server.
  liveTradingEnabled: boolean("live_trading_enabled").notNull().default(false),
  // Phase 19 — opt-in leaderboard participation. Defaults false; user must
  // explicitly opt in. display_name lets them appear as anonymous handle.
  leaderboardOptIn: boolean("leaderboard_opt_in").notNull().default(false),
  leaderboardDisplayName: text("leaderboard_display_name"),
  // 2026-05-12 — opt-in email channel for the daily market digest.
  // The digest cron already fans out to Discord + PWA push for everyone;
  // email is strictly opt-in to avoid spamming users who haven't asked.
  digestEmailOptIn: boolean("digest_email_opt_in").notNull().default(false),
  // 2026-05-12 — click-through acceptance of ToS + risk disclosure.
  // NULL = never accepted. termsAcceptedVersion stores which version
  // they agreed to — bumping TERMS_VERSION in code forces re-prompt.
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  termsAcceptedVersion: text("terms_accepted_version"),
  // 2026-05-14 — subscription tier (Phase 1: enforced via gates, no
  // Stripe yet). Values: 'free' | 'trader' | 'premium' | 'enterprise'.
  // DB-level CHECK constraint enforces the enum.
  tier: text("tier").notNull().default("free"),
  tierChangedAt: timestamp("tier_changed_at", { withTimezone: true }),
  tierExpiresAt: timestamp("tier_expires_at", { withTimezone: true }),
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
