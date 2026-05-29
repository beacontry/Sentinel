-- Persist test-segment trade count + average concurrent positions on each
-- optimization run. The mode comparison reads the run's STORED out-of-sample
-- metrics for the Optimized row (rather than re-simulating, which diverged),
-- but trade count and time-in-market weren't stored — so they rendered as "—".
-- These two columns let the comparison show them. Idempotent.
ALTER TABLE optimization_runs ADD COLUMN IF NOT EXISTS test_trade_count INTEGER;
ALTER TABLE optimization_runs ADD COLUMN IF NOT EXISTS test_avg_positions REAL;
