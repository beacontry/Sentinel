-- 0031 — Congressional trades from official disclosure sources
-- (House Clerk + Senate eFD), replacing the Finnhub
-- congressional-trading endpoint which moved to a paid tier.
--
-- Storage strategy: ingest once, query many. A daily refresh cron pulls
-- fresh PTR filings; the /api/congress route reads from this table.
-- Source is authoritative (federal disclosure forms) — won't change
-- pricing tiers under us.
--
-- Idempotency: the unique constraint on
-- (chamber, filer_name, transaction_date, ticker, transaction_type,
--  amount_from) lets the ingester upsert-skip-on-conflict without
-- needing to track "last ingested" state.

BEGIN;

CREATE TABLE IF NOT EXISTS congressional_trades (
  id BIGSERIAL PRIMARY KEY,
  -- Chamber: "House" or "Senate"
  chamber TEXT NOT NULL,
  -- Filer (member of Congress). Normalized "Last, First" or "Hon. First Last"
  -- as the source provides — kept as-is for searchability.
  filer_name TEXT NOT NULL,
  -- Party + state/district when available (House XML has state; Senate may not)
  party TEXT,
  state_district TEXT,
  -- Transaction metadata
  transaction_date DATE NOT NULL,
  filing_date DATE,
  ticker TEXT,
  asset_description TEXT,
  -- Standardized: "Purchase" | "Sale (Full)" | "Sale (Partial)" | "Exchange"
  transaction_type TEXT NOT NULL,
  -- Disclosed dollar range (federal rules require ranges, not exact $)
  amount_from NUMERIC(15, 2),
  amount_to NUMERIC(15, 2),
  -- "Self" | "Spouse" | "Joint" | "Dependent Child"
  owner_type TEXT,
  -- Provenance — back-reference to the original disclosure
  source_doc_id TEXT,
  source_url TEXT,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT congressional_trades_unique UNIQUE (
    chamber,
    filer_name,
    transaction_date,
    ticker,
    transaction_type,
    amount_from
  )
);

-- Hot path: filter-by-ticker queries
CREATE INDEX IF NOT EXISTS congressional_trades_ticker_idx
  ON congressional_trades (ticker, transaction_date DESC)
  WHERE ticker IS NOT NULL;

-- Default sort (newest filings first)
CREATE INDEX IF NOT EXISTS congressional_trades_txn_date_idx
  ON congressional_trades (transaction_date DESC, filing_date DESC);

-- Filter-by-chamber
CREATE INDEX IF NOT EXISTS congressional_trades_chamber_idx
  ON congressional_trades (chamber, transaction_date DESC);

COMMIT;
