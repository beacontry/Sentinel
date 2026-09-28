-- 0051_stripe_events_completed_at.sql
-- Completion marker for Stripe webhook claims (2026-09-23).
--
-- The webhook claims an event by inserting its row into
-- stripe_events_processed BEFORE running the handler, and any existing row
-- was treated as "already processed". When the handler failed, the claim was
-- rolled back with a DELETE whose failure was swallowed, so on the same DB
-- blip that broke the handler the row survived and every Stripe retry was
-- answered 200 deduped. A crash between claim and handler completion had the
-- same effect. The event (a tier grant or downgrade) was lost silently.
--
-- completed_at is set only after the handler succeeds. A redelivery is
-- deduped only when it is set; a claim without it is retried by Stripe while
-- it is younger than the grace window, and re-claimed and reprocessed once
-- it is older.
--
-- Backfill: every row that exists when the column is added was written by
-- the old code, which treated it as processed, so it gets
-- completed_at = processed_at. That keeps today's dedup behaviour for them.
-- The backfill runs only in the same step that adds the column, so re-running
-- this file never marks a later in-flight claim as completed.
--
-- Idempotent. Apply as postgres, then verify:
--
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'stripe_events_processed' AND column_name = 'completed_at';
--   SELECT count(*) FROM stripe_events_processed WHERE completed_at IS NULL;
--   -- 0 immediately after applying

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'stripe_events_processed'
      AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE stripe_events_processed ADD COLUMN completed_at TIMESTAMPTZ;
    UPDATE stripe_events_processed SET completed_at = processed_at;
  END IF;
END $$;

COMMIT;
