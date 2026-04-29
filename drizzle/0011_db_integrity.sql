-- DB integrity audit: missing UNIQUE constraints + FK indexes.
-- Each block dedupes before adding the constraint so the migration is safe
-- to run on existing data.

-- 1. push_subscriptions.endpoint must be unique to prevent duplicate notifications.
DELETE FROM "push_subscriptions" a
USING "push_subscriptions" b
WHERE a."id" < b."id" AND a."endpoint" = b."endpoint";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_sub_endpoint_idx" ON "push_subscriptions" ("endpoint");
--> statement-breakpoint

-- 2. user_feed_configs (user_id, feed_id) must be unique — users shouldn't
-- accumulate duplicate subscriptions for the same feed.
DELETE FROM "user_feed_configs" a
USING "user_feed_configs" b
WHERE a."id" < b."id" AND a."user_id" = b."user_id" AND a."feed_id" = b."feed_id";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_feed_configs_user_feed_idx" ON "user_feed_configs" ("user_id", "feed_id");
--> statement-breakpoint

-- 3. trader_trades (user_id, broker_order_id) — partial unique so dup imports
-- on broker reconnect don't create duplicate rows. Skipped when broker_order_id
-- is null (not all trades have one yet).
CREATE UNIQUE INDEX IF NOT EXISTS "trader_trades_user_broker_order_idx" ON "trader_trades" ("user_id", "broker_order_id") WHERE "broker_order_id" IS NOT NULL;
--> statement-breakpoint

-- 4. social_likes — composite unique indexes only help WHERE both columns are
-- in the predicate. Add single-column indexes for queries that filter by
-- post/comment/thread alone (e.g., counting likes on a post).
CREATE INDEX IF NOT EXISTS "social_likes_post_idx" ON "social_likes" ("post_id") WHERE "post_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_likes_comment_idx" ON "social_likes" ("comment_id") WHERE "comment_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_likes_thread_idx" ON "social_likes" ("thread_id") WHERE "thread_id" IS NOT NULL;
--> statement-breakpoint

-- 5. trader_trades hot query path: WHERE user_id = ? ORDER BY created_at DESC.
-- Composite index covers both filter and sort.
CREATE INDEX IF NOT EXISTS "trader_trades_user_created_idx" ON "trader_trades" ("user_id", "created_at" DESC);
--> statement-breakpoint

-- 6. trader_signals same hot path — list per user, newest first.
CREATE INDEX IF NOT EXISTS "trader_signals_user_created_idx" ON "trader_signals" ("user_id", "created_at" DESC);
