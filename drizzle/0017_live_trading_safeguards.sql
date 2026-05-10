-- Live-trading safeguards: two new optional risk-profile fields.
--
-- max_daily_notional_pct: cap on gross BUY notional placed in a single
--   trading day, as a fraction of starting equity. Default null = engine
--   uses 1.0 (100% of equity). Setting to 0.5 means: across all buys in a
--   day, total notional cannot exceed 50% of equity. Distinct from
--   max_position_pct (per-trade) and max_daily_loss_pct (P&L-based halt).
--
-- max_consecutive_losses: auto-halt threshold for losing trades in a row.
--   Default null = engine uses 5. Resets on any winning trade.
--
-- Both nullable so existing rows continue to use code defaults — no
-- backfill needed. Idempotent.

ALTER TABLE "user_risk_profiles"
  ADD COLUMN IF NOT EXISTS "max_daily_notional_pct" real;
--> statement-breakpoint

ALTER TABLE "user_risk_profiles"
  ADD COLUMN IF NOT EXISTS "max_consecutive_losses" integer;
