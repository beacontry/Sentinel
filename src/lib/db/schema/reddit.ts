// Admin-managed list of subreddits the Reddit ticker-mention feed queries.
// See drizzle/0033_reddit_subreddits.sql for full schema rationale.

import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  numeric,
  index,
} from "drizzle-orm/pg-core";

export const redditSubreddits = pgTable(
  "reddit_subreddits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Lowercase subreddit slug, no "r/" prefix. Used in the Reddit URL. */
    name: text("name").notNull(),
    /** UI label ("r/WallStreetBets" — admins choose casing). */
    displayName: text("display_name").notNull(),
    description: text("description"),
    /**
     * Sentiment weight. 1.00 = treat as authoritative; <1.00 = down-weight
     * in the hybrid sentiment aggregator. Used to penalize noisy subs
     * without removing them entirely.
     */
    weight: numeric("weight", { precision: 4, scale: 2 }).notNull().default("1.00"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Case-insensitive uniqueness on `name` is enforced via a functional
    // index `LOWER(name)` defined in the migration; drizzle can't model
    // functional indexes, so we don't repeat it here.
    index("reddit_subreddits_enabled_idx").on(t.enabled),
  ]
);
