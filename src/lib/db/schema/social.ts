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

export const forumCategories = pgTable("forum_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const forumThreads = pgTable("forum_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => forumCategories.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  pinned: boolean("pinned").notNull().default(false),
  locked: boolean("locked").notNull().default(false),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("forum_threads_user_idx").on(t.userId),
  index("forum_threads_category_idx").on(t.categoryId),
  index("forum_threads_created_idx").on(t.createdAt),
]);

export const forumReplies = pgTable("forum_replies", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  threadId: uuid("thread_id").notNull().references(() => forumThreads.id, { onDelete: "cascade" }),
  parentReplyId: uuid("parent_reply_id"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("forum_replies_user_idx").on(t.userId),
  index("forum_replies_thread_idx").on(t.threadId),
  index("forum_replies_parent_idx").on(t.parentReplyId),
]);

export const socialPosts = pgTable("social_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  symbol: text("symbol"),
  sharedTrade: jsonb("shared_trade"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("social_posts_user_idx").on(t.userId),
  index("social_posts_created_idx").on(t.createdAt),
]);

export const socialComments = pgTable("social_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: uuid("post_id").notNull().references(() => socialPosts.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("social_comments_user_idx").on(t.userId),
  index("social_comments_post_idx").on(t.postId),
]);

export const socialLikes = pgTable("social_likes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: uuid("post_id"),
  commentId: uuid("comment_id"),
  threadId: uuid("thread_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("social_likes_user_idx").on(t.userId),
  index("social_likes_post_idx").on(t.postId),
  index("social_likes_comment_idx").on(t.commentId),
  index("social_likes_thread_idx").on(t.threadId),
  uniqueIndex("social_likes_user_post_idx").on(t.userId, t.postId),
  uniqueIndex("social_likes_user_comment_idx").on(t.userId, t.commentId),
  uniqueIndex("social_likes_user_thread_idx").on(t.userId, t.threadId),
]);

export const socialFollows = pgTable("social_follows", {
  id: uuid("id").primaryKey().defaultRandom(),
  followerId: uuid("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  followingId: uuid("following_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("social_follows_follower_idx").on(t.followerId),
  index("social_follows_following_idx").on(t.followingId),
  uniqueIndex("social_follows_pair_idx").on(t.followerId, t.followingId),
]);
