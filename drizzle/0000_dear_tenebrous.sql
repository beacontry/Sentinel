CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dashboard_layout_id" uuid,
	"language" text DEFAULT 'en' NOT NULL,
	"feed_configs" jsonb
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"bio" text,
	"role" text DEFAULT 'user' NOT NULL,
	"email_notifications" boolean DEFAULT false,
	"notification_email" text,
	"timezone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_accuracy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_id" uuid NOT NULL,
	"entry_price" real NOT NULL,
	"exit_price" real,
	"actual_return" real,
	"timeframe" text,
	"check_hours" integer DEFAULT 24,
	"was_correct" boolean,
	"measured_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"signal" text NOT NULL,
	"confidence" real NOT NULL,
	"price" real NOT NULL,
	"volume" integer NOT NULL,
	"plain_english" text NOT NULL,
	"indicators" jsonb NOT NULL,
	"timeframe" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"signal_id" uuid NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"quantity" integer NOT NULL,
	"entry_price" real NOT NULL,
	"entry_date" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"action" text NOT NULL,
	"quantity" integer NOT NULL,
	"price" real NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"initial_balance" real DEFAULT 10000 NOT NULL,
	"current_balance" real DEFAULT 10000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"message" text NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"indicator_field" text NOT NULL,
	"operator" text NOT NULL,
	"value" real NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_triggered" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"webhook_url" text NOT NULL,
	"channel_name" text,
	"min_signal_strength" integer DEFAULT 1 NOT NULL,
	"symbols" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trader_daily_pnl" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" text NOT NULL,
	"realized_pnl" real DEFAULT 0 NOT NULL,
	"unrealized_pnl" real DEFAULT 0 NOT NULL,
	"trades_count" integer DEFAULT 0 NOT NULL,
	"halted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trader_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"quantity" integer NOT NULL,
	"entry_price" real NOT NULL,
	"current_price" real NOT NULL,
	"unrealized_pnl" real NOT NULL,
	"stop_price" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trader_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"signal" text NOT NULL,
	"price" real NOT NULL,
	"volume" integer NOT NULL,
	"indicators" jsonb NOT NULL,
	"acted_on" boolean DEFAULT false NOT NULL,
	"trader_timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trader_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connected" boolean DEFAULT true NOT NULL,
	"mode" text DEFAULT 'paper' NOT NULL,
	"last_heartbeat" timestamp with time zone DEFAULT now() NOT NULL,
	"watchlist" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trader_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trader_id" integer,
	"symbol" text NOT NULL,
	"signal" text NOT NULL,
	"action" text NOT NULL,
	"quantity" integer NOT NULL,
	"order_type" text NOT NULL,
	"limit_price" real,
	"stop_price" real,
	"fill_price" real,
	"fill_time" timestamp with time zone,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"pnl" real,
	"notes" text,
	"trader_timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_journal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"title" text NOT NULL,
	"notes" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mood" text,
	"rating" integer,
	"portfolio_trade_id" uuid,
	"trader_trade_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"config" jsonb NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symbol_strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"preset_name" text,
	"stop_loss_pct" real NOT NULL,
	"take_profit_pct" real NOT NULL,
	"trailing_stop_pct" real NOT NULL,
	"hold_period" integer NOT NULL,
	"atr_tuned" boolean DEFAULT false NOT NULL,
	"last_atr" real,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_risk_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_size" real DEFAULT 10000 NOT NULL,
	"max_daily_loss_pct" real DEFAULT 2 NOT NULL,
	"max_drawdown_pct" real DEFAULT 10 NOT NULL,
	"risk_tolerance" text DEFAULT 'moderate' NOT NULL,
	"max_position_pct" real DEFAULT 5 NOT NULL,
	"max_position_size" integer DEFAULT 100 NOT NULL,
	"max_single_trade_loss" real DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"context_data" jsonb,
	"tokens_used" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"date" text NOT NULL,
	"summary" text NOT NULL,
	"watchlist_symbols" jsonb,
	"news_context" jsonb,
	"signal_context" jsonb,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"parent_reply_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_id" uuid NOT NULL,
	"following_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"post_id" uuid,
	"comment_id" uuid,
	"thread_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"symbol" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "education_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"viewed" boolean DEFAULT false NOT NULL,
	"quiz_score" integer,
	"viewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "glossary_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term" text NOT NULL,
	"definition" text NOT NULL,
	"category" text,
	"examples" jsonb,
	"related_terms" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"file_type" text NOT NULL,
	"tax_year" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_harvesting_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"suggestion" text NOT NULL,
	"potential_savings" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tax_year" integer NOT NULL,
	"report_data" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"amount" real NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"body" text NOT NULL,
	"category" text,
	"price" real DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"requires_auth" boolean DEFAULT false NOT NULL,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_feed_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"feed_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"credentials" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "filing_chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"filing_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sec_filings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"filing_type" text NOT NULL,
	"filed_at" timestamp with time zone NOT NULL,
	"url" text NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"summary" text,
	"affected_sectors" jsonb,
	"source_url" text,
	"last_updated" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"layout_data" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_trading_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"strategy_config" jsonb NOT NULL,
	"risk_config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_trading_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"results" jsonb
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_accuracy" ADD CONSTRAINT "signal_accuracy_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_likes" ADD CONSTRAINT "feed_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_likes" ADD CONSTRAINT "feed_likes_post_id_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_positions" ADD CONSTRAINT "portfolio_positions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_trades" ADD CONSTRAINT "portfolio_trades_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_webhooks" ADD CONSTRAINT "discord_webhooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_journal" ADD CONSTRAINT "trade_journal_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_journal" ADD CONSTRAINT "trade_journal_portfolio_trade_id_portfolio_trades_id_fk" FOREIGN KEY ("portfolio_trade_id") REFERENCES "public"."portfolio_trades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_journal" ADD CONSTRAINT "trade_journal_trader_trade_id_trader_trades_id_fk" FOREIGN KEY ("trader_trade_id") REFERENCES "public"."trader_trades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_strategies" ADD CONSTRAINT "saved_strategies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_strategies" ADD CONSTRAINT "symbol_strategies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ADD CONSTRAINT "user_risk_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_replies" ADD CONSTRAINT "forum_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_replies" ADD CONSTRAINT "forum_replies_thread_id_forum_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."forum_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_category_id_forum_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."forum_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_follows" ADD CONSTRAINT "social_follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_follows" ADD CONSTRAINT "social_follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_likes" ADD CONSTRAINT "social_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "education_progress" ADD CONSTRAINT "education_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "education_progress" ADD CONSTRAINT "education_progress_term_id_glossary_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."glossary_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_documents" ADD CONSTRAINT "tax_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_harvesting_suggestions" ADD CONSTRAINT "tax_harvesting_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_reports" ADD CONSTRAINT "tax_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_purchases" ADD CONSTRAINT "article_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_purchases" ADD CONSTRAINT "article_purchases_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feed_configs" ADD CONSTRAINT "user_feed_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feed_configs" ADD CONSTRAINT "user_feed_configs_feed_id_external_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."external_feeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filing_chat_sessions" ADD CONSTRAINT "filing_chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filing_chat_sessions" ADD CONSTRAINT "filing_chat_sessions_filing_id_sec_filings_id_fk" FOREIGN KEY ("filing_id") REFERENCES "public"."sec_filings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_layouts" ADD CONSTRAINT "dashboard_layouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_trading_configs" ADD CONSTRAINT "paper_trading_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_trading_runs" ADD CONSTRAINT "paper_trading_runs_config_id_paper_trading_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."paper_trading_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_preferences_user_idx" ON "user_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "watchlist_user_idx" ON "watchlist_items" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_user_symbol_idx" ON "watchlist_items" USING btree ("user_id","symbol");--> statement-breakpoint
CREATE UNIQUE INDEX "accuracy_signal_idx" ON "signal_accuracy" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX "signals_symbol_idx" ON "signals" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "signals_created_idx" ON "signals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "likes_post_idx" ON "feed_likes" USING btree ("post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "likes_user_post_idx" ON "feed_likes" USING btree ("user_id","post_id");--> statement-breakpoint
CREATE INDEX "feed_user_idx" ON "feed_posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feed_signal_idx" ON "feed_posts" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX "feed_created_idx" ON "feed_posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ppositions_portfolio_idx" ON "portfolio_positions" USING btree ("portfolio_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ppositions_portfolio_symbol_idx" ON "portfolio_positions" USING btree ("portfolio_id","symbol");--> statement-breakpoint
CREATE INDEX "ptrades_portfolio_idx" ON "portfolio_trades" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "ptrades_executed_idx" ON "portfolio_trades" USING btree ("executed_at");--> statement-breakpoint
CREATE INDEX "portfolios_user_idx" ON "portfolios" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "alert_history_rule_idx" ON "alert_history" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "alert_history_triggered_idx" ON "alert_history" USING btree ("triggered_at");--> statement-breakpoint
CREATE INDEX "alert_rules_user_idx" ON "alert_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "alert_rules_symbol_idx" ON "alert_rules" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "push_sub_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "webhooks_user_idx" ON "discord_webhooks" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trader_daily_pnl_date_idx" ON "trader_daily_pnl" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "trader_positions_symbol_idx" ON "trader_positions" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "trader_signals_symbol_idx" ON "trader_signals" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "trader_signals_created_idx" ON "trader_signals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trader_trades_symbol_idx" ON "trader_trades" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "trader_trades_status_idx" ON "trader_trades" USING btree ("status");--> statement-breakpoint
CREATE INDEX "trader_trades_created_idx" ON "trader_trades" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trader_trades_trader_id_idx" ON "trader_trades" USING btree ("trader_id");--> statement-breakpoint
CREATE INDEX "journal_user_idx" ON "trade_journal" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "journal_symbol_idx" ON "trade_journal" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "journal_created_idx" ON "trade_journal" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "journal_portfolio_trade_idx" ON "trade_journal" USING btree ("portfolio_trade_id");--> statement-breakpoint
CREATE INDEX "journal_trader_trade_idx" ON "trade_journal" USING btree ("trader_trade_id");--> statement-breakpoint
CREATE INDEX "strategies_user_idx" ON "saved_strategies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "symbol_strategies_user_idx" ON "symbol_strategies" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "symbol_strategies_user_symbol_idx" ON "symbol_strategies" USING btree ("user_id","symbol");--> statement-breakpoint
CREATE UNIQUE INDEX "risk_profiles_user_idx" ON "user_risk_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_messages_user_idx" ON "chat_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_messages_session_idx" ON "chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "chat_messages_created_idx" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "market_digests_date_idx" ON "market_digests" USING btree ("date");--> statement-breakpoint
CREATE INDEX "market_digests_created_idx" ON "market_digests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "forum_replies_user_idx" ON "forum_replies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "forum_replies_thread_idx" ON "forum_replies" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "forum_replies_parent_idx" ON "forum_replies" USING btree ("parent_reply_id");--> statement-breakpoint
CREATE INDEX "forum_threads_user_idx" ON "forum_threads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "forum_threads_category_idx" ON "forum_threads" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "forum_threads_created_idx" ON "forum_threads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "social_comments_user_idx" ON "social_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "social_comments_post_idx" ON "social_comments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "social_follows_follower_idx" ON "social_follows" USING btree ("follower_id");--> statement-breakpoint
CREATE INDEX "social_follows_following_idx" ON "social_follows" USING btree ("following_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_follows_pair_idx" ON "social_follows" USING btree ("follower_id","following_id");--> statement-breakpoint
CREATE INDEX "social_likes_user_idx" ON "social_likes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_likes_user_post_idx" ON "social_likes" USING btree ("user_id","post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_likes_user_comment_idx" ON "social_likes" USING btree ("user_id","comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_likes_user_thread_idx" ON "social_likes" USING btree ("user_id","thread_id");--> statement-breakpoint
CREATE INDEX "social_posts_user_idx" ON "social_posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "social_posts_created_idx" ON "social_posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "education_progress_user_idx" ON "education_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "education_progress_term_idx" ON "education_progress" USING btree ("term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "education_progress_user_term_idx" ON "education_progress" USING btree ("user_id","term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "glossary_terms_term_idx" ON "glossary_terms" USING btree ("term");--> statement-breakpoint
CREATE INDEX "glossary_terms_category_idx" ON "glossary_terms" USING btree ("category");--> statement-breakpoint
CREATE INDEX "tax_documents_user_idx" ON "tax_documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tax_documents_year_idx" ON "tax_documents" USING btree ("tax_year");--> statement-breakpoint
CREATE INDEX "tax_harvesting_user_idx" ON "tax_harvesting_suggestions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tax_harvesting_symbol_idx" ON "tax_harvesting_suggestions" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "tax_reports_user_idx" ON "tax_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tax_reports_year_idx" ON "tax_reports" USING btree ("tax_year");--> statement-breakpoint
CREATE INDEX "article_purchases_user_idx" ON "article_purchases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "article_purchases_article_idx" ON "article_purchases" USING btree ("article_id");--> statement-breakpoint
CREATE UNIQUE INDEX "article_purchases_user_article_idx" ON "article_purchases" USING btree ("user_id","article_id");--> statement-breakpoint
CREATE UNIQUE INDEX "articles_slug_idx" ON "articles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "articles_author_idx" ON "articles" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "articles_category_idx" ON "articles" USING btree ("category");--> statement-breakpoint
CREATE INDEX "articles_published_idx" ON "articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "user_feed_configs_user_idx" ON "user_feed_configs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_feed_configs_feed_idx" ON "user_feed_configs" USING btree ("feed_id");--> statement-breakpoint
CREATE INDEX "filing_chat_user_idx" ON "filing_chat_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "filing_chat_filing_idx" ON "filing_chat_sessions" USING btree ("filing_id");--> statement-breakpoint
CREATE INDEX "sec_filings_symbol_idx" ON "sec_filings" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "sec_filings_type_idx" ON "sec_filings" USING btree ("filing_type");--> statement-breakpoint
CREATE INDEX "sec_filings_filed_idx" ON "sec_filings" USING btree ("filed_at");--> statement-breakpoint
CREATE INDEX "policy_items_status_idx" ON "policy_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dashboard_layouts_user_idx" ON "dashboard_layouts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "paper_trading_configs_user_idx" ON "paper_trading_configs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "paper_trading_runs_config_idx" ON "paper_trading_runs" USING btree ("config_id");