-- Add shared_trade JSONB column to social_posts for embedding trade data in posts
ALTER TABLE "social_posts" ADD COLUMN "shared_trade" jsonb;
