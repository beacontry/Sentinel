CREATE TABLE "optimization_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"best_fitness" real NOT NULL,
	"avg_fitness" real NOT NULL,
	"worst_fitness" real NOT NULL,
	"best_params" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimization_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"target_metric" text DEFAULT 'total_return' NOT NULL,
	"universe" text DEFAULT 'sp500' NOT NULL,
	"population_size" integer DEFAULT 30 NOT NULL,
	"generations" integer DEFAULT 25 NOT NULL,
	"train_pct" integer DEFAULT 60 NOT NULL,
	"current_generation" integer DEFAULT 0,
	"symbols_fetched" integer DEFAULT 0,
	"total_symbols" integer DEFAULT 0,
	"best_params" jsonb,
	"best_train_return" real,
	"best_test_return" real,
	"baseline_train_return" real,
	"baseline_test_return" real,
	"train_sharpe" real,
	"test_sharpe" real,
	"train_max_drawdown" real,
	"test_max_drawdown" real,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "optimization_symbol_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"total_return" real NOT NULL,
	"sharpe_ratio" real,
	"max_drawdown" real,
	"win_rate" real,
	"trade_count" integer,
	"train_return" real,
	"test_return" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "optimization_generations" ADD CONSTRAINT "optimization_generations_run_id_optimization_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."optimization_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_runs" ADD CONSTRAINT "optimization_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_symbol_results" ADD CONSTRAINT "optimization_symbol_results_run_id_optimization_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."optimization_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "optimization_generations_run_idx" ON "optimization_generations" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "optimization_runs_user_idx" ON "optimization_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "optimization_symbol_results_run_idx" ON "optimization_symbol_results" USING btree ("run_id");
