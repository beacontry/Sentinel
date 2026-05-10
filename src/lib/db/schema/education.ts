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
}, (t) => [
  index("education_guide_views_user_idx").on(t.userId),
  uniqueIndex("education_guide_views_user_slug_idx").on(t.userId, t.slug),
]);
