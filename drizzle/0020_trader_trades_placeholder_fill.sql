-- Phase 16 — slippage reporting requires comparing engine's expected fill
-- price (the quote at submission time) with the actual broker fill price.
-- Without a separate column, the reconciler overwrites fillPrice with the
-- actual value and we lose the placeholder.
--
-- placeholder_fill_price: REAL nullable, set at logTrade() time, never
-- updated after. fill_price is updated by the Phase 11 reconciler.
--
-- Slippage = fill_price - placeholder_fill_price  (signed; sign meaning
-- differs by side — see slippage-report route).
--
-- Idempotent.

ALTER TABLE "trader_trades"
  ADD COLUMN IF NOT EXISTS "placeholder_fill_price" real;
