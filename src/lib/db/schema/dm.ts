import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// 2026-05-12 — private user-to-user direct messages.
//
// Threads store the user pair sorted (user_a_id < user_b_id) so the
// unique index catches duplicates regardless of who started the
// conversation. Look up a thread between two users with `[min(a,b),
// max(a,b)]` — never need a query that considers both orderings.
//
// Per-side last_seen timestamps live as columns rather than a separate
// read-state table — works fine at this scale, no JOIN cost for unread
// counts.

export const dmThreads = pgTable("dm_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  userAId: uuid("user_a_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  userBId: uuid("user_b_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
  aLastSeenAt: timestamp("a_last_seen_at", { withTimezone: true }),
  bLastSeenAt: timestamp("b_last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("dm_threads_pair_uniq").on(t.userAId, t.userBId),
  index("dm_threads_a_idx").on(t.userAId),
  index("dm_threads_b_idx").on(t.userBId),
  index("dm_threads_last_message_idx").on(t.lastMessageAt),
]);

export const dmMessages = pgTable("dm_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").notNull().references(() => dmThreads.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("dm_messages_thread_idx").on(t.threadId),
  index("dm_messages_thread_time_idx").on(t.threadId, t.createdAt),
]);
