-- 0041_congress_dedup_nulls.sql
-- Fix: congressional_trades duplicate rows on every daily re-ingest.
--
-- The unique index congressional_trades_unique covers
--   (chamber, filer_name, transaction_date, ticker, transaction_type, amount_from)
-- but `ticker` and `amount_from` are NULLABLE. Postgres treats NULLs as
-- DISTINCT in a normal unique index, so any PTR row with a NULL ticker
-- (non-stock assets, unparsed rows) or NULL amount NEVER deduped — the
-- ingester's ON CONFLICT DO NOTHING silently inserted a fresh duplicate
-- every day.
--
-- Fix: replace the index with an EXPRESSION unique index that COALESCEs the
-- nullable columns to sentinels, so NULLs collapse to a single logical key.
-- (Chosen over PG15 `NULLS NOT DISTINCT` for portability across PG versions.)
-- The ingester's targetless ON CONFLICT DO NOTHING catches this index too.
--
-- Idempotent: dedup is a no-op once clean; DROP/CREATE INDEX are guarded.

-- 1. Collapse existing NULL-key duplicates, keeping the lowest id per logical
--    key (NULLs treated as equal via COALESCE — matches the new index).
DELETE FROM congressional_trades a
USING congressional_trades b
WHERE a.id > b.id
  AND a.chamber = b.chamber
  AND a.filer_name = b.filer_name
  AND a.transaction_date = b.transaction_date
  AND a.transaction_type = b.transaction_type
  AND COALESCE(a.ticker, '') = COALESCE(b.ticker, '')
  AND COALESCE(a.amount_from, -1) = COALESCE(b.amount_from, -1);

-- 2. Swap the column index for the NULL-safe expression index.
DROP INDEX IF EXISTS congressional_trades_unique;

CREATE UNIQUE INDEX IF NOT EXISTS congressional_trades_unique
  ON congressional_trades (
    chamber,
    filer_name,
    transaction_date,
    COALESCE(ticker, ''),
    transaction_type,
    COALESCE(amount_from, -1)
  );
