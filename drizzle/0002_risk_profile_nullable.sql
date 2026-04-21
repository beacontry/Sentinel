-- Make all risk profile numeric columns nullable (optional overrides)
-- NULL means "let the engine decide" — only user-set values impose limits

ALTER TABLE "user_risk_profiles" ALTER COLUMN "account_size" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "account_size" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_daily_loss_pct" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_daily_loss_pct" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_drawdown_pct" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_drawdown_pct" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "risk_tolerance" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "risk_tolerance" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_position_pct" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_position_pct" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_position_size" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_position_size" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_single_trade_loss" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_single_trade_loss" DROP DEFAULT;--> statement-breakpoint

-- Clear existing default values so stored profiles reflect actual user intent
-- (existing rows with old defaults become NULL = "engine decides")
UPDATE "user_risk_profiles"
SET "account_size" = NULL,
    "max_daily_loss_pct" = NULL,
    "max_drawdown_pct" = NULL,
    "risk_tolerance" = NULL,
    "max_position_pct" = NULL,
    "max_position_size" = NULL,
    "max_single_trade_loss" = NULL;
