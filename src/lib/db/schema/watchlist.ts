import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// Phase A.1 — multi-watchlist. A user can have many named watchlists,
// exactly one of which is marked isDefault. Default-invariant is enforced
// both at the DB layer (partial unique index `watchlists_user_default_uniq`
// from migration 0023) and at the API layer (demote-then-promote in tx).
export const watchlists = pgTable("watchlists", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  // 2026-05-12 — public share token. NULL = private (default). When set,
  // /w/[token] renders the list read-only without authentication.
  shareToken: text("share_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("watchlists_user_idx").on(t.userId),
]);

// Items are scoped to a specific watchlist. The legacy (userId, symbol)
// uniqueness has been replaced with (watchlistId, symbol) so the same
// symbol can live in multiple lists owned by the same user. We keep
// userId on the row for fast "all symbols this user owns anywhere"
// queries that don't need to join through watchlists (legacy compat).
export const watchlistItems = pgTable("watchlist_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  watchlistId: uuid("watchlist_id").notNull().references(() => watchlists.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("watchlist_user_idx").on(t.userId),
  index("watchlist_items_watchlist_idx").on(t.watchlistId),
  uniqueIndex("watchlist_items_list_symbol_uniq").on(t.watchlistId, t.symbol),
]);
