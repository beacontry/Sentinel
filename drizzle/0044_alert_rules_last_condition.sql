-- 0044_alert_rules_last_condition.sql
-- Edge-triggering for alert rules.
--
-- Alert rules fired on EVERY evaluation while the condition held true
-- (throttled only by a 1h cooldown), so "crossover" rule types were really
-- level checks — a "bullish crossover" alert fired for a stock that crossed
-- days ago and was merely still above. This column lets the engine fire only
-- on the false→true transition and re-arm once the condition clears.
--
-- Fast metadata-only add on PG 11+ (non-volatile default, no table rewrite).
-- Idempotent.

ALTER TABLE alert_rules
  ADD COLUMN IF NOT EXISTS last_condition_met BOOLEAN NOT NULL DEFAULT false;
