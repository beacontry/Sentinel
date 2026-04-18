import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { signals } from "./signals";

export const feedPosts = pgTable("feed_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  signalId: uuid("signal_id").notNull().references(() => signals.id, { onDelete: "cascade" }),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("feed_user_idx").on(t.userId),
  index("feed_signal_idx").on(t.signalId),
  index("feed_created_idx").on(t.createdAt),
]);

export const feedLikes = pgTable("feed_likes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: uuid("post_id").notNull().references(() => feedPosts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("likes_post_idx").on(t.postId),
  uniqueIndex("likes_user_post_idx").on(t.userId, t.postId),
]);
