import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const glossaryTerms = pgTable("glossary_terms", {
  id: uuid("id").primaryKey().defaultRandom(),
  term: text("term").notNull(),
  definition: text("definition").notNull(),
  category: text("category"),
  examples: jsonb("examples"),
  relatedTerms: jsonb("related_terms"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("glossary_terms_term_idx").on(t.term),
  index("glossary_terms_category_idx").on(t.category),
]);

export const educationProgress = pgTable("education_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  termId: uuid("term_id").notNull().references(() => glossaryTerms.id, { onDelete: "cascade" }),
  viewed: boolean("viewed").notNull().default(false),
  quizScore: integer("quiz_score"),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
}, (t) => [
  index("education_progress_user_idx").on(t.userId),
  index("education_progress_term_idx").on(t.termId),
  uniqueIndex("education_progress_user_term_idx").on(t.userId, t.termId),
]);

/**
 * Per-user spaced-repetition review state for glossary terms.
 *
 * Implements a simplified SM-2 algorithm:
 *   - easeFactor: starts at 2.5, drops on lapses, recovers on success
 *   - intervalDays: days between reviews (1, 3, 7, 14, 30, 60, 120, ...)
 *   - nextReviewAt: when this term is due again
 *   - lapses: count of failed reviews (quality < 3)
 *
 * termId references glossary-data.ts string IDs (not a DB FK — glossary is
 * authored as TS data, not in glossary_terms table).
 */
export const glossaryReviewState = pgTable("glossary_review_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  termId: text("term_id").notNull(),
  easeFactor: integer("ease_factor").notNull().default(250), // x100 for integer storage; 250 = 2.50
  intervalDays: integer("interval_days").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  lastQuality: integer("last_quality"),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  nextReviewAt: timestamp("next_review_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("glossary_review_state_user_idx").on(t.userId),
  index("glossary_review_state_user_due_idx").on(t.userId, t.nextReviewAt),
  uniqueIndex("glossary_review_state_user_term_idx").on(t.userId, t.termId),
]);

/**
 * Per-user trader tax status & §475(f) MTM election tracking.
 *
 * One row per user (created on first declaration). Pure self-attestation —
 * we don't enforce IRS rules, just record what the user says. Used to:
 *   - Display TTS / MTM badge on Tax Center
 *   - Suppress wash-sale warnings for MTM-elected users
 *   - Surface MTM-specific messaging in tax callouts
 */
export const userTaxStatus = pgTable("user_tax_status", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** User claims Trader Tax Status (Schedule C deductions). Self-attested. */
  hasTraderTaxStatus: boolean("has_trader_tax_status").notNull().default(false),
  /** Tax year the §475(f) MTM election is/was effective. NULL if not elected. */
  mtmElectionYear: integer("mtm_election_year"),
  /** Date the user recorded the MTM election here. */
  mtmDeclaredAt: timestamp("mtm_declared_at", { withTimezone: true }),
  /** Free-form user notes (e.g., "Filed Form 3115 on 2026-04-15 with CPA Smith"). */
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("user_tax_status_user_idx").on(t.userId),
]);

/**
 * Per-user view tracking for long-form education guides.
 *
 * Guides are authored as TS data (src/lib/education/guides-data.ts), not in the
 * DB — so we identify them by slug rather than a foreign key. One row per
 * (user, slug). View count and last-viewed timestamp are bumped on each visit.
 */
export const educationGuideViews = pgTable("education_guide_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }).defaultNow().notNull(),
  lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }).defaultNow().notNull(),
  viewCount: integer("view_count").notNull().default(1),
  bookmarked: boolean("bookmarked").notNull().default(false),
  /** Most recent quiz score (0..total) — nullable until first attempt. */
  quizScore: integer("quiz_score"),
  /** Total questions on the most recent attempt — used to derive percentage. */
  quizTotal: integer("quiz_total"),
  /** Set the first time the user passes (>= 80%); never reset on subsequent attempts. */
  quizPassedAt: timestamp("quiz_passed_at", { withTimezone: true }),
  /** Number of submitted attempts. Bumped every quiz POST. */
  quizAttempts: integer("quiz_attempts").notNull().default(0),
}, (t) => [
  index("education_guide_views_user_idx").on(t.userId),
  uniqueIndex("education_guide_views_user_slug_idx").on(t.userId, t.slug),
]);
