-- Delayed-trail activation knobs on user_risk_profiles (2026-06-11 review).
-- Both default to NULL = off; engine treats NULL as 0 (legacy behavior).
--
-- trail_activation_profit_pct: peak must rise this fraction above entry before
--   the trailing stop engages. e.g. 0.05 = wait for +5% peak. Recommended
--   value per the post-2026-06-11 robustness sweep.
--
-- trail_activation_bars: position must age this many trading days before the
--   trailing stop engages. e.g. 1 = no trail intraday on entry day. Less
--   robust than the profit gate per the sweep; surfaced for opt-in tuning.
--
-- The fixed disaster stop (entry × (1 - stopLossPct)) is active from bar 0
-- regardless of these knobs. Breakeven-promote ladder also fires
-- independently. The gate only delays trailing-stop activation.

ALTER TABLE user_risk_profiles
  ADD COLUMN IF NOT EXISTS trail_activation_profit_pct REAL,
  ADD COLUMN IF NOT EXISTS trail_activation_bars INTEGER;
