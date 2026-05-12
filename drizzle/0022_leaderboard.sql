-- Phase 19 — opt-in P&L leaderboard with privacy controls.
--
-- users.leaderboard_opt_in: defaults false. User must explicitly opt in
-- via Settings. Without opt-in, never appears on the leaderboard.
--
-- users.leaderboard_display_name: optional anonymous handle (e.g. "Trader 47").
-- When null, the user's real name is used. Never expose email.
--
-- Idempotent.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "leaderboard_opt_in" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "leaderboard_display_name" text;
