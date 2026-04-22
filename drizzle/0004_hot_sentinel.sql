ALTER TABLE "trader_trades" ADD COLUMN "broker_order_id" text;--> statement-breakpoint
ALTER TABLE "trader_trades" ADD COLUMN "signal_id" uuid;--> statement-breakpoint
CREATE INDEX "trader_trades_broker_order_idx" ON "trader_trades" USING btree ("broker_order_id");