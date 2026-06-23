-- 0047_alert_last_condition_nullable.sql
-- Make alert_rules.last_condition_met nullable (audit #10).
--
-- 0044 added the column NOT NULL DEFAULT false. That conflated "never
-- evaluated" with "condition was false", so the FIRST cron evaluation of a
-- freshly-created rule whose level is ALREADY true (price already above the
-- SMA, MACD already positive) saw false->true and fired a spurious
-- "crossover detected" — the exact "still true since days ago" false-cross the
-- edge-trigger design was meant to eliminate.
--
-- NULL now means "never observed": decideAlert records the current state as a
-- baseline on the first eval without firing, then fires only on a subsequent
-- genuine false->true transition. Existing rows keep their boolean value
-- (already observed). New rows insert NULL (no default).
--
-- Idempotent: DROP NOT NULL / DROP DEFAULT are no-ops if already applied.
ALTER TABLE alert_rules ALTER COLUMN last_condition_met DROP NOT NULL;
ALTER TABLE alert_rules ALTER COLUMN last_condition_met DROP DEFAULT;
