DROP INDEX "trader_daily_pnl_date_idx";--> statement-breakpoint
DROP INDEX "trader_positions_symbol_idx";--> statement-breakpoint
DROP INDEX "trader_trades_trader_id_idx";--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "account_size" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "account_size" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_daily_loss_pct" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_daily_loss_pct" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_drawdown_pct" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_drawdown_pct" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "risk_tolerance" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "risk_tolerance" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_position_pct" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_position_pct" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_position_size" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_position_size" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_single_trade_loss" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_risk_profiles" ALTER COLUMN "max_single_trade_loss" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trader_daily_pnl" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "trader_positions" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "trader_signals" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "trader_status" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "trader_trades" ADD COLUMN "user_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "trader_daily_pnl_date_user_idx" ON "trader_daily_pnl" USING btree ("date","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trader_positions_symbol_user_idx" ON "trader_positions" USING btree ("symbol","user_id");--> statement-breakpoint
CREATE INDEX "trader_signals_user_idx" ON "trader_signals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trader_trades_user_idx" ON "trader_trades" USING btree ("user_id");