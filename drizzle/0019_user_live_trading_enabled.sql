-- Phase 13 — per-user live-trading permission.
--
-- ALLOW_LIVE_TRADING env flag is the global kill-switch (set at infra level
-- by the operator). Once enabled, this per-user column gates which users
-- can actually start a live engine. Default false so existing users + new
-- signups can't accidentally start live trading even on a live-unlocked
-- droplet.
--
-- Engine refuses live boot unless BOTH conditions hold:
--   1. process.env.ALLOW_LIVE_TRADING === "1"  (global infra gate)
--   2. user's live_trading_enabled = true       (per-user grant)
--
-- Admins flip per-user via /dashboard/admin → User Engines section.
-- Idempotent.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "live_trading_enabled" boolean NOT NULL DEFAULT false;
