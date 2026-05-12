-- Phase 18 — AI-generated trade summary cached per trader_trades row.
-- Anthropic API calls are paid + slow (~2-5s), so we generate on-demand
-- and cache the result so subsequent reads are instant.
--
-- ai_summary: TEXT nullable. NULL = not yet summarized. Set once per row.
-- ai_summary_generated_at: TIMESTAMPTZ — provenance, for re-gen UX.
--
-- Idempotent.

ALTER TABLE "trader_trades"
  ADD COLUMN IF NOT EXISTS "ai_summary" text,
  ADD COLUMN IF NOT EXISTS "ai_summary_generated_at" timestamp with time zone;
