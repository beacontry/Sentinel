-- Exit forensics for the trading engine. Read-only: every statement runs
-- inside a READ ONLY transaction that is rolled back at the end.
--
-- This is the query set behind the 2026-11-01 exit-model change
-- (docs/changelog.md). Re-run it a fortnight after any exit change and read
-- the buckets in section F: under the backtested model the flat band (±0.5%)
-- should shrink, the −6..−2.5% band should thin out, and more exits should
-- land above +3%.
--
-- Run from the droplet:
--   sudo -u postgres psql -X sentinel_db -f scripts/exit-forensics.sql
-- Change the two dates below to the window you care about.

\pset pager off
\set since '''2026-07-15'''
\set month_floor '''2026-04-01'''
BEGIN TRANSACTION READ ONLY;

\echo '== 1. Engines: last heartbeat, connection, snapshot mode'
SELECT left(s.user_id,8) AS usr, s.connected, s.mode, s.last_heartbeat::timestamp(0),
       e.snapshot_at::timestamp(0) AS snap_at, e.payload->>'mode' AS engine_mode
FROM trader_status s LEFT JOIN trader_engine_snapshot e ON e.user_id = s.user_id
ORDER BY s.last_heartbeat DESC;

\echo '== 2. Weekly realized P&L per user'
SELECT left(user_id,8) AS usr, date_trunc('week', date::date)::date AS wk,
       round(sum(realized_pnl)::numeric,2) AS realized, sum(trades_count) AS trades,
       bool_or(halted) AS any_halt, string_agg(DISTINCT engine_mode, ',') AS modes
FROM trader_daily_pnl WHERE date >= :since
GROUP BY 1,2 ORDER BY 1,2;

\echo '== 3. Latest unrealized per user'
SELECT DISTINCT ON (user_id) left(user_id,8) AS usr, date, round(unrealized_pnl::numeric,2) AS unrealized
FROM trader_daily_pnl ORDER BY user_id, date DESC;

\echo '== 4. Closed trades by exit type'
SELECT left(user_id,8) AS usr, signal, count(*) AS n,
       count(*) FILTER (WHERE pnl > 0) AS wins,
       round(100.0*count(*) FILTER (WHERE pnl > 0)/nullif(count(*),0),1) AS win_pct,
       round(sum(pnl)::numeric,2) AS total, round(avg(pnl)::numeric,2) AS avg,
       round(avg(pnl) FILTER (WHERE pnl > 0)::numeric,2) AS avg_win,
       round(avg(pnl) FILTER (WHERE pnl <= 0)::numeric,2) AS avg_loss
FROM trader_trades WHERE pnl IS NOT NULL AND created_at >= :since
GROUP BY 1,2 ORDER BY 1, total;

\echo '== 5. Monthly realized, win rate, profit factor'
SELECT left(user_id,8) AS usr, date_trunc('month', created_at)::date AS mon, count(*) AS closed,
       round(100.0*count(*) FILTER (WHERE pnl > 0)/nullif(count(*),0),1) AS win_pct,
       round(sum(pnl)::numeric,2) AS net,
       round((sum(pnl) FILTER (WHERE pnl > 0) / nullif(-sum(pnl) FILTER (WHERE pnl < 0),0))::numeric,2) AS profit_factor
FROM trader_trades WHERE pnl IS NOT NULL AND created_at >= :month_floor
GROUP BY 1,2 ORDER BY 1,2;

\echo '== F. Exits bucketed by distance from entry (the diagnostic that found the exit-model gap)'
WITH s AS (
  SELECT t.user_id, t.symbol, t.pnl, t.signal, t.fill_price AS exit_px, t.created_at AS sold,
         (SELECT b.fill_price FROM trader_trades b WHERE b.user_id=t.user_id AND b.symbol=t.symbol AND b.action='BUY'
            AND b.created_at < t.created_at AND b.status='FILLED' ORDER BY b.created_at DESC LIMIT 1) AS entry_px,
         (SELECT b.created_at FROM trader_trades b WHERE b.user_id=t.user_id AND b.symbol=t.symbol AND b.action='BUY'
            AND b.created_at < t.created_at AND b.status='FILLED' ORDER BY b.created_at DESC LIMIT 1) AS bought
  FROM trader_trades t WHERE t.pnl IS NOT NULL AND t.created_at >= :since)
SELECT left(user_id,8) AS usr,
  CASE WHEN exit_px/entry_px-1 < -0.06 THEN 'a < -6%' WHEN exit_px/entry_px-1 < -0.025 THEN 'b -6..-2.5%'
       WHEN exit_px/entry_px-1 < -0.005 THEN 'c -2.5..-0.5%' WHEN exit_px/entry_px-1 <= 0.005 THEN 'd flat +-0.5%'
       WHEN exit_px/entry_px-1 <= 0.03 THEN 'e +0.5..3%' ELSE 'f > +3%' END AS bucket,
  count(*) AS n, round(sum(pnl)::numeric,0) AS net, round(avg(extract(epoch from sold-bought)/86400)::numeric,1) AS avg_days
FROM s WHERE entry_px > 0 GROUP BY 1,2 ORDER BY 1,2;

\echo '== 8. Optimizer runs'
SELECT left(id::text,8) AS run, status, universe, created_at::date,
       round(best_train_return::numeric,2) AS train, round(best_test_return::numeric,2) AS test,
       round(baseline_test_return::numeric,2) AS base_test, test_trade_count AS test_n,
       is_active, auto_promotion_decided_at::date AS decided, left(error,40) AS err
FROM optimization_runs WHERE created_at >= :since ORDER BY created_at;

\echo '== 9. Active params'
SELECT left(id::text,8) AS run, best_params FROM optimization_runs WHERE is_active;

\echo '== 10. Engine alerts by kind'
SELECT left(user_id,8) AS usr, kind, severity, count(*), max(created_at)::timestamp(0) AS last
FROM engine_alerts WHERE created_at >= :since GROUP BY 1,2,3 ORDER BY 1,4 DESC;

\echo '== 11. Halts'
SELECT left(user_id,8) AS usr, date, engine_mode, halt_reason, round(realized_pnl::numeric,2) AS realized
FROM trader_daily_pnl WHERE halted AND date >= :since ORDER BY date;

ROLLBACK;
