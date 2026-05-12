-- Phase 4 — Engine intelligence features. Adds risk-profile columns
-- backing several engine behaviors:
--
--   max_sector_exposure_pct  → sector exposure cap. Refuses new BUYs
--                              when any sector would exceed this % of
--                              equity. NULL = disabled.
--   adaptive_mode_enabled    → auto-swap engine mode based on VIX +
--                              SPY trend regime. Defaults false.
--   earnings_blackout_days   → block BUYs within N trading days of a
--                              symbol's earnings release. NULL = disabled.
--
-- All idempotent. Empty values fall back to engine defaults / disabled.

BEGIN;

ALTER TABLE user_risk_profiles
  ADD COLUMN IF NOT EXISTS max_sector_exposure_pct real,
  ADD COLUMN IF NOT EXISTS adaptive_mode_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS earnings_blackout_days integer;

COMMIT;
