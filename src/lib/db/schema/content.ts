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

export const articles = pgTable("articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  body: text("body").notNull(),
  category: text("category"),
  price: real("price").notNull().default(0),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("articles_slug_idx").on(t.slug),
  index("articles_author_idx").on(t.authorId),
  index("articles_category_idx").on(t.category),
  index("articles_published_idx").on(t.publishedAt),
]);

export const articlePurchases = pgTable("article_purchases", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  articleId: uuid("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("article_purchases_user_idx").on(t.userId),
  index("article_purchases_article_idx").on(t.articleId),
  uniqueIndex("article_purchases_user_article_idx").on(t.userId, t.articleId),
]);

export const externalFeeds = pgTable("external_feeds", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  requiresAuth: boolean("requires_auth").notNull().default(false),
  category: text("category"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userFeedConfigs = pgTable("user_feed_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  feedId: uuid("feed_id").notNull().references(() => externalFeeds.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  credentials: text("credentials"), // encrypted
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("user_feed_configs_user_idx").on(t.userId),
  index("user_feed_configs_feed_idx").on(t.feedId),
]);
