# Trading / Quant Patterns (Sentinel)

Build-patterns, correctness disciplines, and the recurring bug-classes for Sentinel's trading engine, backtester, optimizer, broker layer, and tax engine. The **how-to-build-it-right + traps** cookbook — it complements, not duplicates:
- `docs/ENGINE_RULESET.md` — the engine's *current behavior* spec (what each mode does).
- `docs/changelog.md` — dated "when did X land".
- `docs/audit-2026-06-17.md` — the 86-finding audit most of these patterns trace to.

Patterns cite the audit finding that motivated them. **Cite symbols/functions, not line numbers** — line numbers drift; names are stable.

## Contents
- Backtest Fidelity
- Optimizer / GA Discipline
- Live Engine — Scan Loop, Cancellation & Halt Accounting
- Positions, Fills & Reconciliation
- Risk Gating (canPlaceBuyOrder) & Live Safeguards
- Broker Adapters & Market Data
- Tax Engine
- Numeric Correctness & Testing Trading Code

---

## Backtest Fidelity

**Intrabar look-ahead — anchor trail to prior-bar peak.** Trailing stops must use the prior bar's peak, not the current bar's. Bug: raising `position.peakPrice = bar.high` then deriving `dynTrailPct` from that new peak, then checking `bar.low <= effectiveStop` — assumes high ticks before low, overstating trail effectiveness and biasing GA toward tight values that underperform live. Fix: store `peakForTrail = position.peakPrice` before the loop updates it, test against `peakForTrail * (1 - dynTrailPct)`, and only after the exit check passes does `bar.high > position.peakPrice` raise the peak. Applied to both backtester.ts and optimizer.ts:portfolioBacktest so GA fitness mirrors reality.

**Gap-through fills — stop at min(stop, open), TP at max(tp, open).** A stop-loss gapped below the stop level fills at the open, not the stop. A take-profit gapped above the TP fills at the open, not the TP. Without this, backtester books every gap-down exit at the stop (understates drawdown) and every gap-up exit at TP (overstates upside), inflating metrics. Fix (backtester.ts; optimizer.ts): after detecting trigger, apply gap-through before slippage: `stopFill = Math.min(effectiveStop, bar.open)` when gapped through, then apply slippage on the realistic fill.

**Slippage + commission via BACKTEST_COSTS.** Both backtester and GA use `slippageBps = 5` (5 bps per side, ~10 bps round-trip) and `commissionPerFill = 0` (Alpaca equities) from config.ts. Buys fill at `close × (1 + SLIP)`, sells at `close × (1 - SLIP)`. Without friction, a tiny per-trade edge compounds into fantasy returns — pre-cost-model runs (before 2026-05-28) showed 1000%+ returns in sideways markets (GA fitting noise). Heuristic: if a test return dwarfs buy-and-hold (e.g. 500% vs 10%), it's overfit or a pre-cost run — do not deploy. All three consumers (GA backtester, mode-compare, live engine) must read the same constants; any live slippage change updates them together.

**Survivorship bias via TOP_50 / TOP_150 vs "sp500".** Static `TOP_50` and `TOP_150` lists miss losers delisted years ago (GE, Intel pre-2020s), inflating backtest returns. Prefer `TOP_150` for breadth or use `"sp500"` if Wikipedia live-fetch available (point-in-time membership changes mid-backtest, which Sentinel does not yet correct). Audit finding motivates this: equal-weight buy-and-hold benchmark only works if universe is consistent.

**Train-only fitness; holdout scored once as true OOS.** Fitness (optimizer.ts) evaluates **only on training window**. Old design blended `0.6 × train + 0.4 × test`, leaking test into selection — GA optimized "test" return, so reported OOS was meaningless. Fix: `portfolioBacktest(data, params, "train", eligibleOn)` feeds fitness; test window scored *once* on final winner as genuine holdout. Expect test returns 30–50% of train on realistic strategy; >80% suggests overfitting or loose bounds. Re-run optimizer after deploying new code, as old params were tuned on biased fitness.

**Daily mark-to-market equity curve — Sharpe/Sortino/drawdown from daily returns.** Pre-fix: `equityCurve` had entries only at trade exits, so Sharpe annualized per-trade returns as daily. Fix (backtester.ts): every bar pushes `{ date, value: cash + (position ? shares × close: 0) }`. Sharpe uses daily returns, drawdown scans all daily peaks, Calmar uses real calendar scaling. Optimizer's portfolioBacktest also builds daily equity curves.

**Trail-floor clamp — sub-2% base trail never widens.** Dynamic trail: `dynTrail = floor + (base − floor) × e^(−3×profit)`. For `base < floor`, old formula inverted: as profit grew, range expanded, trail widened toward floor (opposite of tightening). For conservative `base = 0.01`, trail loosened from 1% → 2% as trade worked. Fix (backtester.ts; optimizer.ts): clamp range at 0: `Math.max(0, base − floor)`. Sub-floor base stays flat at floor, never widens. Applied to both so GA fitness is not biased.

**Backtester ↔ live-engine parity.** Both use `BACKTEST_COSTS` from config.ts and `TRAIL_FLOOR = 0.02`. Position sizing: backtester uses fixed `positionPct = 0.10, maxPositions = 10` (optimizer.ts); live engine uses user risk settings. Graduation gate reflects optimized-mode behavior (see ENGINE_RULESET.md). Breakeven-ladder and disaster-stop math coded identically (backtester.ts vs trading-engine.ts). Intentional divergence: backtester uses lightweight `analyzeSignalOnly` (GA speed); live engine uses full `analyzeBars` + optional hybrid layers (sentiment/analyst/AI). GA params tuned on signal-only, portable to live engine's analyzeBars (same crossover/RSI/volume logic), but hybrid layers add real-time adjustment backtester did not model.

**Survivorship: STRONG_BUY overflow hard cap.** Optimizer allows `STRONG_BUY` to exceed `maxPositions` by 50% (optimizer.ts: `BACKTEST_HARD_CAP_STRONG_BUY = Math.floor(maxPositions × 1.5)`), mirroring live engine (trading-engine.ts). Without parity, backtester underestimates position count during strong-signal windows and live params tuned rosier. PR #17 closed this audit gap.

---

## Optimizer / GA Discipline

**Fitness: `excessReturn × sharpeMult × drawdownMult` (multipliers floored at 0.05).** GA optimizes portfolio excess return (strategy − equal-weight buy-and-hold benchmark) on training window only. Train/test split prevents leakage: fitness uses train; test scored *once* on final winner as genuine OOS holdout. When excessReturn ≤ 0, skip multipliers. When > 0: `sharpeMult = min(max(Sharpe, 0), 1.0)` clamps to [0,1]; `drawdownMult = max(0, 1 − maxDrawdown% / 30)` where maxDrawdown is a *percent*, not fraction (audit: pre-fix `/0.30` was `/0.0030` intent, a 100× unit bug that disabled risk control for 3 months). Multipliers floored at 0.05 so GA still climbs away from extreme-risk params even at zero gradient. Reference `portfolioBuyHold` in optimizer.ts for canonical benchmark math: equal-weight allocation, integer shares, entry-cost slippage + commission, exit at close (no cost).

**RE-DERIVATION GATE: code + re-run required.** Live engines read `bestParams` from in-memory cache (`_optimizedParamsCache`, keyed by userId) loaded at boot. Changes to fitness logic, PARAM_RANGES, signal logic, or backtest costs do NOT auto-optimize — persisted params stay frozen. Shipping code change without re-run = live engines read old params tuned under old fitness landscape. **Pattern: always pair code + re-run in deploy notes.** For fitness/cost/range changes, post-deploy instructions must include admin re-run on test account + mode-compare verify before flipping live engines.

**Signal params GA-tuned (EMA/RSI/RS), per-portfolio, not hardcoded.** GA tunes `emaFast`, `emaSlow`, `rsiOversold`, `rsiOverbought` per portfolio (not per-symbol). `getOptimizedSignalParams(userId)` reads them from latest completed run's `bestParams`. Live engine `analyzeHybrid` calls `analyzeBars(symbol, bars, optimizedSignalParams)` if a run exists. Mode-compare backtest and screener call `analyzeBars` without GA params (scale + rate limits). Mode-compare route (src/app/api/backtest/mode-compare/route.ts) reads `bestParams` and passes to `runBacktest` so Optimized config reflects live behavior — pre-2026-05-29 it read `takeProfitPct` (which GA never writes), silently dropping Optimized to defaults.

**Cache keyed by userId.** Pre-fix: single shared cache slot meant tenant B's latest run leaked to tenant A's engine on boot; A adopted B's GA params with zero audit trail. The per-userId map (5-min TTL) closes the cross-tenant bleed. Verify userId predicate in load path: `where(and(eq(optimizationRuns.userId, userId),...))` for fallback (active run is global-shared by design, no userId gate).

**rsThreshold: 59-bar, not 60-day.** `portfolioBacktest` at optimizer.ts checks `rs59 = (w[w.length − 1].close − w[w.length − 61].close) / past` when `w.length >= 61`. Array distance is 59 bars (indices −1 to −61 = 60 positions = 59 intervals). Label misleading; behavior correct per semantics. Live engine via `analyzeSignalOnly` mirrors this. Param name should be `rs59Threshold` to avoid confusion.

**PARAM_RANGES (optimizer.ts) define GA search space.** Broadest defensible bounds: `stopLossPct [0.01, 0.12]`, `trailingStopPct [0.01, 0.15]`, `holdPeriod [5, 60]`, `rsiOversold [20, 40]`, `rsiOverbought [60, 80]`, `emaFast [5, 15]`, `emaSlow [15, 50]`, `takeProfitAtrMult [3, 15]`, `rsThreshold [−0.10, 0.10]`. Narrow ranges prune local optima; test-collapse signals overfit. Expect test returns 30–50% of train; >80% suggests loose bounds or "buy everything" strategy.

**Point-in-time S&P 500 membership gates entries by date.** GA supports three universes: `top50`, `top150` (static), or `sp500` (point-in-time). For `sp500`, `getSP500MembershipResolver` builds historical constituent lookup; `eligibleOn(date)` passed to every buy check. Removes *survivorship bias* (buying only today's winners retroactively). Full-history guard for top50/top150 (optimizer.ts) drops symbols with first bar >15d after window start. **Run on `sp500` by default for realistic backtest.**

**Diversity tracking + adaptive mutation prevent premature convergence.** GA computes diversity as avg normalized Euclidean distance across parameter pairs (maxPairs=500). When diversity < DIVERSITY_LOW (0.10), mutation ramps toward MUTATION_RATE_MAX (0.50); when > DIVERSITY_HIGH (0.35), eases toward MUTATION_RATE_MIN (0.10). Stagnation: if best fitness doesn't improve for STAGNATION_GENS (8) generations, mutation → max and STAGNATION_IMMIGRANT_RATE (15%) of population replaced with random individuals to escape local optima. Monitor `optimizationGenerations.diversity` — if near 0 and stuck, re-run on tighter PARAM_RANGES or longer generation count.

**Backtester parity: same signals, stops, entry/exit logic as live engine.** `portfolioBacktest` mirrors `runScan` + `runExitCheck`: same EMA/RSI/VWAP/SMA via `analyzeSignalOnly`, same trail formula (exponential decay with profit-tightening + TRAIL_FLOOR = 0.02), same graduation-lock (TP locks stop at entry×1.30), same breakeven-ladder, same hold-period check. Position sizing hardcoded (BACKTEST_POSITION_PCT = 10%, BACKTEST_MAX_POSITIONS = 10, BACKTEST_HARD_CAP_STRONG_BUY = 15) vs. risk-profile driven. Entry fills: `close × (1 + SLIP) − commission`; exit: `close × (1 − SLIP) − commission`, where SLIP = BACKTEST_COSTS.slippageBps / 10000 = 5 bps (audit: intrabar lookahead and gap fills fixed). Verify parity when divergence: check SLIP, COMMISSION, TRAIL_FLOOR, BACKTEST_HARD_CAP_STRONG_BUY are identical across GA backtester, mode-compare, and live engine.

**Cost model realism: BACKTEST_COSTS from src/lib/config.ts.** Slippage = 5 bps per side (0.0005 entry, 0.0005 exit); commission = $0/fill (Alpaca equity). Early runs pre-cost-model (2026-05-28 and prior) showed 1000%+ returns in sideways markets (fitting noise). Runs before 2026-05-28 should not be deployed. If test return >> buy-and-hold (e.g., 500% vs 10%), likely overfit or pre-cost-model.

**Pre-buy gates (canPlaceBuyOrder → passesSmartFilters).** Earnings blackout ±5d (hardcoded; user earningsBlackoutDays not honored — audit), relative strength ≥ rsThreshold (59-bar momentum), Finnhub sentiment bullish% ≥ 30% (or 0.5 neutral if Finnhub down). When storing new run, verify `bestParams` contains all 8 keys: `stopLossPct`, `takeProfitAtrMult`, `trailingStopPct`, `holdPeriod`, `rsiOversold`, `rsiOverbought`, `emaFast`, `emaSlow`, `rsThreshold`.

**Re-run cadence: 10–60 min (sp500 slower).** New params inert until set `isActive = true` via save-preset. Deploy sequence: ship code → post-deploy admin re-run test account → mode-compare backtest compare new vs old → eyeball test returns (honest, not fantasy-high) → flip live engines. Re-run without code changes safe to push live immediately (same GA, same fitness, fresh market data).

---

## Live Engine — Scan Loop, Cancellation & Halt Accounting

**Dual cadence:** `runScanInner` every 15 min (signal analysis, entry logic); `runExitCheck` every 1 min (live quotes, stops/TP/trail). Independent loops — trailing stops track the live peak, not yesterday's close. (See ENGINE_RULESET § Exit Logic.)

**Cooperative cancellation via `scanGeneration`.** The 10-minute override can fire a fresh scan while the previous runs. Both execute concurrently; instead of AbortController, each scan captures `myGeneration = ++engine.scanGeneration` at entry and calls `throwIfScanCancelled(engine, myGeneration)` at major yield points. If a newer scan incremented `scanGeneration`, the check throws and exits early. Orphaned in-flight requests complete but land on the floor. Top-level catch of `ScanCancelledError` returns cleanly with no error pollution.
- **Audit (2026-05-26):** A stale scan's gate-then-await-order-then-record sequence placed one extra order after being superseded — `canPlaceBuyOrder` checks `dailyNotional`, then `await placeEngineOrder`, then `recordOrderPlacement` increments counter. No cancellation gate between the gate and order. **Fix:** re-check `throwIfScanCancelled` immediately before `placeEngineOrder` in every buy/sell branch; move `recordOrderPlacement` (the counter mutation) BEFORE the await.

**`tripSafeguardHalt` (protective) vs `haltEngine` (terminal).** `tripSafeguardHalt` sets `halted=true` and `haltReason` to block new BUYs; the 1-min exit-check intentionally bypasses the halt gate (halting entry but freezing protection on losing positions inverts safety). Fires on: `consecutive_losses` (5+ losers), `account_mismatch` (broker account changed), `equity_collapse` (account shrunk >20%), `broker_unreachable` (network down). `haltEngine` is terminal: clears all intervals, liquidates all positions at market, sets `running=false`, evicts from memory. Users must click Start to resume. Halt persists to `trader_daily_pnl.halted + haltReason`, so restart cannot auto-resume after emergency halt.
- **Why asymmetry?** Right after a halt, conditions are deteriorating and stops need to stay active to self-resolve existing positions, not freeze them unprotected.

**Halt accounting: NET realized P&L, not gross.** `accrueRealizedPnl` adds closed position's pnl (win or loss) to `engine.dailyLoss`. A day with +$5,000 wins and −$2,100 losses accumulates `dailyLoss = −$2,100` (NET). `enforceUnrealizedLossHalt` gates on `mtmLoss = dailyLoss + totalUnrealizedPnl`, comparing it against `unrealizedThreshold = realizedThreshold × 1.5`. The 1.5× multiplier gives open positions 50% more rope before MTM halt fires at cumulative peak loss; once unrealized is realized, daily-loss includes it and both gates stay synchronized.
- **Audit (2026-05-28):** Pre-fix, `dailyLoss += (pnl < 0) ? pnl: 0` accumulated only losses, ignoring winners. High-turnover day with net +$2,900 (gross +$5,000 wins, −$2,100 losses on 2% cap) would halt despite being profitable. **Fix:** accumulate NET pnl; aligns halt basis with dashboard metric.

**Shared `recordRealizedExit` across all exit sites.** Every discretionary single-position exit (runScan stop/TP, runExitCheck trailing/SL, tactical-smart swap-sell) calls `recordRealizedExit(engine, pnl, riskLimits)` to handle NET daily-loss accounting AND consecutive-loss streak counter uniformly. Mass regime-flattens (SPY weakness exit) deliberately do NOT call `recordRealizedExit` per-position; they accrue P&L but record NET streak result as a single trade, so a defensive flatten of N losers doesn't itself trip consecutive-loss halt (audit-06-17).
- **Why single NET streak result?** A regime move (SPY −2%) that correlates N picks is market risk, not strategy risk. Recording one coherent result preserves the signal rather than amplifying N individual losses into five strikes.

**Halt auto-recovery: streak halts clear on date rollover and regime rebound.** `maybeClearDailyLossHaltOnDateRollover` fires on every scan's first tick of a new ET trading day, resetting `dailyLoss` and `dailyNotional` to 0 and clearing `halted` if reason is `daily_loss` or `consecutive_losses`. Counters reset because these are intraday-scope signals — a Tuesday 5-loss streak does not predict Wednesday's picks. Integrity halts (`account_mismatch`, `equity_collapse`, `broker_unreachable`, `user_emergency_halt`) persist across days.
- **Regime auto-resume (added 2026-06-12):** `maybeClearConsecutiveLossesHaltOnRegime` checks: (1) halted with reason `consecutive_losses`, (2) ≥30 min since halt fired, (3) SPY intraday drop > 1.5%. If all pass, clears `halted` and zeros `consecutiveLosses`. Example: five trailing-stop hits on Monday −2% SPY dump stay offline until Tuesday rollover pre-fix; regime gate now catches Monday afternoon +0.8% recovery and re-engages. Does NOT apply to `daily_loss` — daily-loss is a hard cumulative cap, not a streak signal.

**Halt persistence to `trader_daily_pnl`.** Every halt writes `halted=true + haltReason` to today's daily P&L row via `upsertDailyPnl`. This persists halt across deploys so `autoStartIfNeeded` can suppress auto-resume if an integrity halt is in effect. `tripSafeguardHalt` writes immediately (fire-and-forget) so dashboard reflects halt within ~1s; pre-2026-05-28 halt was only visible after next scan boundary, causing 15-min lag.

**MTM drawdown halt (realized + unrealized).** `enforceUnrealizedLossHalt` is the bleed-out circuit breaker: `mtmLoss = dailyLoss + totalUnrealizedPnl` measured at scan end, gated at `dailyLossPct × 1.5× equity`. Once it fires, NEW positions are blocked. Crucially, `tripSafeguardHalt` here does NOT call `cancelAllOrders` — bleed scenarios typically have protective stops at broker actively limiting losses; cancelling strips protection.
- **Audit (2026-05-28):** Broker-side stops (Alpaca auto-fire, manual sells, external closures) write realized loss to `trader_trades.pnl` but never updated in-memory `dailyLoss`. A day where broker stops do most selling can see `dailyLoss` near 0 while real losses pile up in DB — realized halt never trips. **Fix:** when `reconcileBrokerSideExit` or `reconcilePendingTrades` resolve broker-side loss, add to `engine.dailyLoss` (guard against double-count by tagging engine-placed `broker_order_ids` or marking as auto-reconciled).

**Halt `haltContext` field tracks timestamp for cooldown gates.** When `tripSafeguardHalt` or `enforceUnrealizedLossHalt` fires, sets `haltContext = { reason, haltedAt: Date.now }`. Regime-resume gate enforces 30-min cool-down before re-engaging, preventing instant flap-resume if SPY bounces briefly. Cleared by user Start, cross-day rollover, or successful regime auto-resume.

**Scan persistence via `engine-snapshot.ts`.** At end of every successful `runScan`, engine calls `saveEngineSnapshot` to persist SNAPSHOT_VERSION=1 JSON: position map, daily-loss/consecutive-loss counters, cooldowns, pending-exit set, recent-order timestamps, exit-rejection tracking, unprotected symbols, boot-equity. On `autoStartIfNeeded`, engine hydrates fields if snapshot is <60 min old; older snapshots discarded (broker is source of truth). Snapshots with version mismatch or corrupt JSON return null and engine boots cold — safe degradation. Prevents redeploy mid-halt from re-arming streaks or losing halt context.
- **Why snapshot instead of DB?** Position map (entry prices, peaks, stops, ATR, RSI cached per position) is computed at scan time and needs to survive 10-min scan cycles to maintain monotonic peak-price tracking. Reconstructing purely from broker holdings + yesterday's bars loses intraday peak, causing false stops at next 1-min exit-check.

---

## Positions, Fills & Reconciliation

### **Broker is source of truth — sync at scan start**

`syncPositionMapFromBroker` reconciles in-memory `positionMap` with live broker positions at the top of every scan. On broker disconnect, `getBrokerPositionCache` (process-global) provides a fallback. The deprecated `traderPositions` DB table is not authoritative.

### **Position-map drift: detect mid-scan broker desync**

`detectPositionMapDrift` prevents silently opening duplicate positions when a broker-side action (stop fired, manual close) happens between sync and a downstream `canPlaceBuyOrder` call.

### **Reconcile pending fills — PENDING, PARTIAL, broker latency**

`reconcilePendingTrades` queries the broker for real fill status on engine-placed orders logged as status="PENDING":
- **FILLED** → update `fillPrice`, correct `pnl` via delta math (actual − placeholder) × qty
- **CANCELED/EXPIRED/REJECTED** → update status, clear pnl 
- **PARTIAL** → remain PENDING, re-reconcile until complete

**7-day lookback (`RECONCILE_LOOKBACK_MS = 7*24*60*60*1000`)** covers realistic halt/outage windows; 24h was too short (2026-06-09 incident: 50h halt orphaned fills). P&L delta corrects the placeholder estimate only.

> Guard: broker fills with zero/negative/missing prices are rejected; skip correction to avoid fabricated losses.

### **Corporate actions: prevent first, rescale as fallback**

Splits are ANNOUNCED days-to-weeks ahead — the cheapest handling is not holding through them. Preventive layer (2026-07-15): broker corporate-actions calendar → shared daily cache (earnings-cache semantics) → (a) BUY gate refusing entries with an ex-date inside the blackout window, (b) market exit on the **last trading day before the ex-date** (weekend-aware; holidays at worst exit a day early — the safe direction), routed through the existing 1-min exit path so it inherits every guard. Key insight: a split is economically neutral to hold through, but **brokers cancel open GTC protective stops on the ex-date** — the position sits unprotected until the next stop-sync. Detection/rescale (below) stays as the net for unannounced or missed actions.

### **Corporate actions: a split is a rescale, not a trade (2026-07-14 CRWD/CVNA incident)**

A forward/reverse split changes share count and per-share basis while conserving TOTAL cost basis; a partial close, add-on buy, or averaging fill changes total basis. So "broker qty moved >10% while total basis stayed within 2%" is a split signature — `detectSplitAdjustment` (pure, tested). Three integration points, all required:
- **Broker sync** (`syncPositionMapFromBroker`): detect + rescale entry/stop/TP/peak in place, audit `engine.position_split_adjusted`. Without this, the stale stop sits far above the post-split price and "realizes" a phantom loss against the pre-split basis (CRWD 4:1: fabricated −$2,829 AND tripped the daily-loss halt on it).
- **1-min exit check**: the split lands overnight and the exit poll runs from the open, possibly before the first scan sync. A quote below 60% of tracked entry re-verifies against the broker BEFORE firing the stop; confirmed split → rescale + skip tick; verification error → protection wins, exit proceeds.
- **Reconciler** (`reconcileBrokerSideExit`): an entry/fill ratio within 3% of an integer ≥2 (either direction) is a split signature — adjust the basis and note it in the row instead of booking the phantom (CVNA 5:1: −$1,882).

### **ORM param-mapping trap: typed value against a raw SQL fragment (2026-05-17 → 2026-07-15 outage)**

`gt(sql\`COALESCE(${col.a}, ${col.b})\`, someDate)` has NO column driver-mapping for the right-hand param when the left side is a raw fragment — drizzle hands the `Date` object to postgres.js unmapped and it throws **client-side** ("Received an instance of Date") before the query reaches PG. Consequences that made this brutal to find: zero server-side trace; drizzle's wrapper message is just "Failed query: <sql>" (the real reason hides in `err.cause`); and fail-soft catch semantics turned it into silent protection loss for two months. Rules: (1) bind primitives (`date.toISOString()`) whenever the comparison target is a raw fragment — PG infers the type from context; (2) **always log `err.cause`** alongside driver-wrapped errors; (3) a protection that fails to refresh past a grace window must ALERT (engine_alerts + audit), not warn-log — fail-soft without fail-loud is how wash-sale ran dead with zero gate blocks and nobody noticed.

### **Blocked-set writes are synchronous at exit time; the refresh is backfill**

Wash-sale/losing-reentry sets rebuilt from `trader_trades` every 5 min have two windows where a re-buy sneaks through: the refresh interval itself, and (worse) reconciler-inserted broker-side exits that don't exist as rows until the next scan. `recordRealizedExit(engine, pnl, riskLimits, symbol)` adds losing exits to BOTH sets synchronously at every discretionary exit site — the DB-driven refresh is a backfill for restarts, not the primary path.

### **reconcileBrokerSideExit — GTC stops fire outside scans**

Position disappears → `reconcileBrokerSideExit` queries broker for actual fill and auto-logs to `trader_trades` for tax accuracy. Same **7-day lookback**. Idempotent via unique `(user_id, broker_order_id)`. Feed realized P&L into `engine.dailyLoss` via `recordRealizedExit` so halt accounting sees true losses.

> Gotcha: distinct from `reconcilePendingTrades` (engine-placed pending fills vs. broker-side closed positions).

### **Partial fills left PENDING — no terminal status**

Stay PENDING so delta math runs once complete. Prior code moved to terminal PARTIAL_FILLED, silently orphaning final fills and gains.

### **Engine-state eviction — every lifecycle end**

`evictEngineState` removes engine from `__tradingEngines`, `__enginePositionMaps`, `__brokerPositionCache`. `stopEngine` schedules eviction on deferred timer (`ENGINE_EVICTION_DELAY_MS = 11*60*1000`). `haltEngine` DOES NOT evict — halts leak entries on restart cycles.

### **reserveManualFlatten — release only claimed symbols**

`reserveManualFlatten` guards `pendingExits` to serialize UI flattens across 15min scan and 1min exit-check. Release callback must capture pre-owned set and delete ONLY non-pre-owned. Canonical pattern:
```typescript
const preOwned = new Set(symbols.filter(s => engine.pendingExits.has(s)));
for (const s of symbols) engine.pendingExits.add(s);
return { release: (sold) => {
 for (const s of symbols)
 if (!preOwned.has(s)) engine.pendingExits.delete(s);
}};
```

### **Manual trades block while engine runs**

Engine's `positionMap` invariant breaks if manual BUY opens outside engine knowledge. UI must block position-opens during engine running state. Flatten is allowed via `reserveManualFlatten`.

---

## Risk Gating (canPlaceBuyOrder) & Live Safeguards

**Gate sequence: earnings blackout → sector cap → losing-reentry cooldown → wash-sale → daily notional → order rate-limit** (trading-engine.ts). Reject on first failure. Run most gates every `WASH_SALE_REFRESH_MS` (5 min) via `maybeRefreshWashSaleSet` / `maybeRefreshLosingReentrySet` to avoid stale checks blocking trades mid-scan.

### Earnings Blackout (5d, hardcoded — audit)
Pass `riskLimits.earningsBlackoutDays` to `isInEarningsBlackout` instead of hardcoding 5 days.

### Sector Exposure Cap — De-Pooling Off-List
`getSectorForExposureCap` (sectors.ts) assigns off-list symbols and ETFs each their own bucket (self-keyed by ticker) so commodity ETFs + unrelated SPDR holdings don't pool spuriously. Contrast display-only `getSymbolSector` which shows "ETF"/"Other" for UI heatmaps. Snapshot position map at scan-start via `buildSectorExposureContext` (trading-engine.ts) and pass to every `canPlaceBuyOrder` call so same-scan buys in one sector see accumulated exposure (audit: pre-PR-14 used stale snapshot, bypassing the cap on multi-symbol same-sector buys).

### Wash-Sale (31d, symbol-level, MTM-aware)
`refreshWashSaleBlockedSymbols` (trading-engine.ts) blocks re-entry on losing exits in past 31 days. Symbol-level (over-conservative; lot-level not implemented). Query `trader_trades` for `action IN ('SELL', 'manual_close'), pnl < 0`, gate at line 987. `mtmElected` (user_tax_status) disables wash-sale (audit: wrap query with `withTimeout(1500,...)` so hung DB check doesn't block the engine).

### Losing-Reentry Cooldown (3d, strategy gate)
`refreshLosingReentryBlockedSymbols` (trading-engine.ts) blocks re-entry on losses in past 5 calendar days (~3 trading days), fires before wash-sale. Off in tactical mode only (`losingReentryCooldownEnabled = mode !== 'tactical'`) because tactical's mass-rotate assumes pivoting away from losers, not re-entry (audit finding: tactical/tactical-smart bypass daily-loss and consecutive-loss halts, so this cooldown is the companion safeguard against falling-knife re-entry).

### Daily Notional Cap
`notionalCap = bootEquity × maxDailyNotionalPct`. Sum BUY notionals since midnight UTC via `engine.dailyNotional`, reject if cumulative exceeds cap. SELL always allowed. Resets at scan-start on new day. Recommended: `maxDailyNotionalPct = 0.5` (50% of equity/day).

### Order Rate Limit (30/60s, hard cap)
30 orders per 60-second sliding window per engine. Caps runaway loops; 15-min scan batching 20 buys + 5 exits = 25 orders in ~30s is normal and passes.

### Position Sizing
**Optimized mode:** fixed equity × positionPct; qty = floor((equity × positionPct) / price) up to maxPositionSize.
**Tactical-smart mode:** inverse-volatility weighting; low-vol names get larger %, high-vol smaller, clamped at positionPct (audit: positionPct fields mixed units; fix: divide by 100 at load time, internal positionPct is always a fraction 0.0–1.0).

### Live-Only Safeguards
**ALLOW_LIVE_TRADING gate:** `ALLOW_LIVE_TRADING=1` required to boot any engine on `environment="live"`; paper always enabled.
**Account-switch + equity-collapse halt:** capture `boot.account_number` and `boot.equity` at scan-start, halt if account changed or equity < 50% of boot.
**Layering:** each gate independent; cheapest (earnings) first, most expensive (rate-limit) last.

---

## Broker Adapters & Market Data

**Unified broker abstraction.** `BrokerClient` interface (src/lib/brokers.ts) is implemented by `AlpacaClient`, `IBKRClient`, `TradierClient`. Engine resolves the active broker per user via `resolveBrokerClient(userId)`.

### Numeric coercion: `positivePriceOrNull` guards P&L

**Audit:** `toNumber` coerces unparseable values to 0. On `filledPrice`, a malformed broker response (null, NaN) coerces to 0, feeding 0-priced fills into P&L delta math and fabricating losses. Use **`positivePriceOrNull`** (brokers.ts) for required-to-be-nonzero fields (entry price, fill price). Returns null for absent/0/negative/non-numeric input, preventing 0 from masquerading as a market price. Applied at parse time: `filledPrice: positivePriceOrNull(o.filled_avg_price)`. If broker response's fill price is absent or zero, the order stays `filledPrice: null` and engine skips dividend logic on it (safe default).

### Rate limiting: 429 + Retry-After backoff

**Audit:** old code treated 429 (rate limit) as a generic error; callers retry immediately (adding to queue) or halt after 5 failures. `brokerFetch` (brokers.ts) now detects 429, parses `Retry-After` header via `parseRetryAfterMs`, and throws `BrokerError` with `retryable: true` and `retryAfterMs` set. Callers check `error.retryable`: if true, back off the specified window (or 60s default if header missing). Broker-unreachable halt counts only non-retryable errors (transient 429/503 excluded). **Consequence:** rate-limit spike no longer halts live trading; order placement queues instead.

### Error messaging: sanitized user-facing, full text server-side

**Audit:** raw Alpaca errors leak buying-power figures, account restrictions, internal codes ("40310100" = PDT). `placeOrder` (brokers.ts) logs full broker text server-side, maps only safe cases to canned copy ("Insufficient buying power for this order", "Symbol not tradable"), defaults to generic "Failed to place order". Match case-insensitively so Alpaca text changes don't silently drop the message.

### Single-leg bracket downgrade: bracket → OTO

**Audit:** bracket order requires BOTH legs (entry + stop + take-profit). Engine may compute only one (user conviction on stop-loss but no TP). Old code forwarded one-sided bracket to Alpaca, which rejects with 422. **Fix:** `placeOrder` (brokers.ts) checks `hasTp` and `hasSl`, downgrades to `order_class: "oto"` (one-triggers-other) if only one leg present. Order succeeds and achieves desired protection even with asymmetric strategy.

### `cancelAllOrders`: 207 Multi-Status != success

**Audit:** DELETE /v2/orders returns 207 (Multi-Status) when SOME orders canceled but others failed. Old code checked `res.ok` (true for 207) and returned success, assuming all canceled — position fully exposed. **Fix:** explicitly check for 207, log warning with response body, return normally (partial cancel better than full fail). Callers independently re-verify broker positions after flatten so they catch position leakage from partial cancel.

### `brokerFetch`: 10s timeout, AbortController

Network hangs block the scan loop indefinitely. `brokerFetch` wraps every broker call with `FETCH_TIMEOUT_MS = 10_000` timeout via `AbortController`. If broker endpoint hangs, `controller.abort` fires, fetch rejects with AbortError, and `brokerFetch` throws `BrokerError(..., retryable: true)`. Without this guard, a hung endpoint would block the service's main thread for 30–90 seconds. **Note:** clear timeout in finally block to orphan-proof.

### Market-data providers and fallback chains

**Yahoo** (free, no key, 60-day history, 6s timeout): caches bars to disk with TTL proportional to market state (15 min during open, 4 hours after close — audit). **Finnhub** (paid key, longer history, real-time, per-minute rate limiter). **FallbackProvider** (market-data.ts) wraps primary + secondary with `totalBudgetMs = 10000` hard cap. If primary fails, secondary is tried with remaining budget. Prevents cascading timeouts (Yahoo 6s + Finnhub 6s = 12s, hangs scan). Budget exhaustion abandons both, returns empty.

### Cache TTL proportional to cadence AND market state

**Audit:** original code cached 1d bars for 4 hours flat, even during market hours (9:30–16:00 ET). **Fix:** `BAR_CACHE_MAX_AGE_OPEN_MS = 15*60*1000` (15 min) during market hours; `BAR_CACHE_MAX_AGE_CLOSED_MS = 4*60*60*1000` (4 hours) after-hours. 5-minute bars use `BAR_CACHE_5M_MAX_AGE_MS = 11*60*1000` (11 min, slightly longer than 5-min scan interval). **Rule:** cache TTL must not exceed consumer's decision-update cadence. 15-min reeval → 15-min cache; 5-min reeval → 5-min cache. Overnight cache can be much longer (market closed).

### Quote freshness before entry/exit: re-quote right before order

**Audit:** `planSwapSellRedeploy` (trading-engine.ts) prices the order and sets stop/TP from a quote captured 5+ minutes earlier in the scan loop. By swap-sell time (bottom of loop), market has moved, quote is stale. Engine sizes order and computes `stopLossPrice = oldPrice × (1 - stopLossPct)` on outdated price. **Fix:** call `fetchQuote` RIGHT BEFORE placing order. 10–20ms latency negligible vs 5–60s scan loop; freshness win huge. Engine must re-quote before entry and every exit (swap-sell, TP, SL).

### Minute-bar freshness: exclude live unclosed bar

**Audit:** Polygon timestamps minute aggregate at START of minute (e.g., 14:23:00 for 14:23–14:23:59 bar). Current minute's bar is in-progress with partial volume/OHLC. Momentum analyzer's breakout check (analyzeMomentumBars) treats it as closed, causing flickering signals that reverse once true close prints. **Fix:** momentum route, after fetching `rawBars`, drop final bar if younger than 60s: `const last = rawBars[rawBars.length - 1]; const bars = (last && Date.now - new Date(last.date).getTime < 60_000) ? rawBars.slice(0, -1): rawBars`. Only CLOSED minute bars analyzed. (Backtester's 5-min and 1-day bars are historical, closed by definition.)

### Finnhub key cached at boot; rotation requires restart

`getFinnhubClient` (finnhub.ts) returns singleton instantiated on first call, storing apiKey in constructor. Rotating key via admin UI requires app restart; key stays stale in-memory. LLM path picks changes on next call after 60s cache expiry. **Workaround:** manually restart app after key update in admin UI, or refactor client to read key on every call (higher latency, zero restart). Plan key rotation at deployment time.

### Rate limiter: serialize acquire via promise chain

**Audit:** Finnhub's `RateLimiter` (finnhub.ts) had TOCTOU bug: two concurrent callers could both see token, both await same delay, both decrement, overshooting 60/min cap. **Fix:** serialize via promise chain: each `acquire` enqueues onto `this.chain` promise, ensuring check-then-decrement atomic per caller.

---

## Tax Engine

**FIFO over full history; filter disposals by tax year post-match.** Run FIFO matching on ALL trades (including prior-year BUYs), then filter disposals (SELLs/manual_close) by tax-year bounds. Filtering before FIFO orphans prior-year lots (audit: /api/tax/report pre-filtered to year, silencing cross-year disposals). Call `generateForm8949(allTrades, { taxYearStart, taxYearEnd })` at src/lib/tax-engine.ts; year bounds are honored inside the function.

**Tax-year boundary: ET-anchored Dec 31 23:59:59 ET ↔ Jan 1 00:00:00 ET (not UTC).** A fill at 8 PM ET Dec 31 timestamps as ~01:00 UTC Jan 1, which with UTC boundaries mis-files into the following tax year. Use `new Date('${year}-01-01T00:00:00.000-05:00')` and `new Date('${year}-12-31T23:59:59.999-05:00')` and compare against trade `executedAt.getTime`. CSV export also formats dates in ET via `getETDateString`.

**Normalize manual_close to SELL before FIFO; uppercase action.** Both `action: "manual_close"` (UI flatten) and `"SELL"` (scan exits) are disposals. Normalize to `"SELL"` before FIFO matching: `const action = t.action.toUpperCase === "BUY" ? "BUY": "SELL"` (src/app/api/tax/report/route.ts). Failing to normalize orphans manual_close lots (audit: export filtered `r.action === "SELL"` in JS, silencing manual_close rows even though SQL only checked status="FILLED"; matched BUYs were never consumed, realized gains vanished from Form 8949).

**Long-term: calendar anniversary, not 365 days (leap-safe).** Sale > calendar anniversary of purchase (2024-01-01 buy → 2025-01-01 anniversary, so 01-01 sale is short-term). Use `oneYearAfter = new Date(purchaseDate); oneYearAfter.setFullYear(purchaseDate.getFullYear + 1); isLongTerm = saleDate > oneYearAfter` to handle leap years. Naive 365-day misclassifies a 2024-01-01 buy + 2025-01-01 sale (366 days) as long-term (audit: tax-report.ts used 365-day while tax-engine.ts used anniversary; the cross-Feb-29 position was wrongly classified). Canonical: src/lib/tax-engine.ts, tested at tests/unit/tax-engine.test.ts.

**Wash-sale: symbol-level, 30-day window, disallowance not pro-rated (known limitation).** Detect IRC §1091 losses and same-symbol repurchases within ±30 days; mark loss as disallowed, track `washSaleDisallowed` amount. Replacement lot's cost-basis adjustment and holding-period tacking per §1223(3) are NOT implemented—net direction: user overpays tax. Over-conservative: exact symbol only (not substantially-identical ETFs like SPY ↔ IVV) and symbol-level (100 shares lost + 30 replacement disallows entire loss, not 30/100 pro-rata). Surface limitations in Tax Center UI footnotes pending focused §1091 rewrite. `WASH_SALE_DAYS = 30` at src/lib/tax-engine.ts.

**Harvesting value: holding-period-appropriate rate, before $3k/yr cap.** `suggestHarvesting` values a harvested loss at its offset rate: long-term loss offsets LTCG (0/15/20%), short-term offsets ordinary (10–37%). Detect holding period and select rate (audit: function applied ordinary rate to all losses, overstating long-term savings by 22 pct points). For broker positions with no acquisition date, assume short-term, flag `holdingUnknown: true`. Figure is gross "loss × rate"—assumes loss offsets a realized gain of same character. Does NOT apply the $3k/yr ordinary-offset cap (aggregate depends on realized gains unknown in per-position view); Tax Center disclaimers and JSDoc cover this (src/lib/tax-engine.ts, rate selection line 505).

**§475(f) MTM election disables wash-sale.** Mark-to-market filers (user_tax_status.mtm_elected) treat all positions as ordinary income regardless of holding period. Skip wash-sale detection and report ordinary-income sum only. Tunnel status through user_tax_status.mtm_elected (migration 0048); effective next engine start. Surface as Trader UI card for self-attestation. See src/lib/trading-engine.ts (alongside wash-sale + losing-reentry gates, Phase 5).

**Form 8949 CSV includes manual_close.** Every FILLED row with non-null price is a disposition; normalize to SELL for FIFO and lot-level reporting. Manual_close rows supply their own gains; no special suppression. Schema: columns a–h per Form 8949 (description, date acquired, date sold, proceeds, cost basis, code, adjustment, gain/loss), generated by `generateForm8949`, exported via `/api/export/tax-report` or Tax Center route. See src/app/api/tax/report/route.ts (query + normalize) and src/lib/tax-engine.ts (Form8949Line construction).

---

## Numeric Correctness & Testing Trading Code

### Basis & Division Guards

**Never compute ratios on zero or undefined basis.** Profit factor (wins/losses) is ∞ not 0 when no losses; relative strength uses (1+r)/(1+b) not r/b to stay monotonic through negative markets (naive r/b inverts at turnovers). Guard before division: `den === 0 ? null: num / den` (relative-strength.ts). Null survives JSON; NaN/Infinity crash downstream.toFixed. **Audit:** fitness blended incomparable bases (portfolio compounded vs. per-symbol simple return), corrupting GA training. Canonical fix: one formula, freeze it; retrain after fitness changes mandatory.

### Undefined ≠ Zero (Correlation)

**Pearson correlation returns null for flat/constant series, not 0.** Zero variance makes it undefined, not independent. Returning 0 masked concentration risk. Replace `den === 0 ? 0:...` with `den === 0 ? null:...` (correlation.ts). Callers render null as "n/a". **Audit.**

### Growth-Factor Ratios in Negative Regimes

**Use (1+r)/(1+b), never r/b, when benchmarking through zero.** At negative turnovers, simple ratios invert. Canonical: relative-strength.ts, guard denominator always (commented distinction; protect against refactoring to naive form).

### Profit Factor Edge Case

**Guard before dividing wins by losses.** When no losses, profit factor is ∞. Check `!(totalLosses > 0)` and cap factor or skip calculation (e.g., use fixed safety position size). Synthetic-bar fixtures: 100% win rates → test boundary, ensure no Infinity propagates to order qty.

### Never Assume fillPrice / Entry Price > 0

**Guard `!(x > 0)` before money math.** Audit: `toNumber` coerces unparseable broker numerics to 0, feeding into P&L delta: `pnl = (0 - entryPrice) × qty` = fabricated huge loss. Before fill-price arithmetic, assert `if (!(fillPrice > 0)) throw new Error(...)`. Positions with null/undefined/zero entryPrice/currentPrice skip P&L. **Audit:** trades with no fillPrice silently orphan in tax FIFO.

### EMA Crossover Alignment

**End-align history arrays before comparing.** Fast EMA (window 9) and slow (window 21) start at different bars and cap at maxHistory=50; differing array lengths (60–89 bar window) cause 10+ bar skew when indexed from front. Canonical fix (analyzer.ts): `minLen = Math.min(fastHistory.length, slowHistory.length); fast = fastHistory.slice(-minLen); slow = slowHistory.slice(-minLen)` then index both at same i. **Audit:** corrupts optimizer GA training on bad params; backtester inherits bad params.

### Momentum Confidence (Hardcoded Denominators)

**Guard hardcoded numeric denominators in formulas.** Momentum analyzer (momentum-analyzer.ts) uses 0.05 and 3; NaN/Infinity if params shift. Zero-volume consolidation via `/ k || 1` fabricates huge spike on 0 volume. Canonical fix: check numerator/denominator before division; zero-volume → 0 (no surge), not fabricated high multiple.

### Fibonacci Swing Direction

**Determine swing direction before computing retracements.** Audit: old code always computed from swing high, mislabeling downtrend levels. Canonical fix (fibonacci.ts): `downtrend = swingLow.date > swingHigh.date`, use downtrend ? `swingLow + ratio×range`: `swingHigh - ratio×range`. Test with synthetic downtrend + uptrend fixtures.

### VWAP Session Reset

**VWAP must reset at intraday session open.** Audit: code never reset, cumulative over 90 days → meaningless. Pass session-scoped bars only (e.g., today's 5-min bars, strip prior day). Test: pass 5-min bars from yesterday + today, verify output resets at market open.

### Takeaway: Pure Decision Functions + Unit Tests

Extract pure logic from I/O engine, unit-test independently. Canonical examples (tests/unit/):
- `shouldGraduateExit(pos, bars, indicators, price) → null | {exit, reason}` (trading-engine.ts): guards volume ÷0, avoids NaN on stale RSI, returns honest null.
- `promoteToGraduationFloor(pos, price?) → boolean` (trading-engine.ts): caps lock below currentPrice so broker stop never rejects (audit, line 2277).
- `planSwapSellRedeploy(input) → {attempts, skips, reachedHardCap, reachedExposureCap}` (trading-engine.ts): pure tree, mirrors live loop.
- `decideAlert(conditionMet, lastConditionMet, lastTriggered, now, cooldownMs) → {fire, persistState}` (alert-engine.ts): first observation records baseline but does NOT fire (audit, lines 46-48).

**Mirror-logic tests for engine internals:** synthetic-bar fixtures exercising hidden logic:
- Graduation + stop lock: buyLock at entry×1.10, trigger TP graduation, verify stop capped just below 1.10 so next poll doesn't force-exit.
- Daily-loss halt for all three modes (scan, tactical, tactical-smart): insert losing trades, verify engine.dailyLoss and consecutive-loss streak increment.
- Swap-sell buying power: exit position, compute freed power, verify redeploy checks post-exit balance not pre-exit snapshot.

### Synthetic-Bar Fixtures

**Deterministic bars stress-testing numeric edge cases:**
- **Gap down on buy:** entry×0.88 stop now above water, must clamp below gap-down low.
- **Zero-volume consolidation:** 5 bars [100, 100.5, 99.5, 100, 0 volume] → analyzer returns volumeSurge=false (not fabricated).
- **All-time high plateau:** 20 bars trending up, peak bar 15 ($150), 5 bars flat at $148 → shouldGraduateExit detects plateau (distFromPeak < 2%) only bars 16–20.
- **Halted stock:** 10 bars [50, 50, 50, 50, 0 volume] → Fibonacci returns null (consRange=0), not ÷0.
- **Negative returns:** $100→$50 over 20 bars, relative strength handles benchmark=-100% (factor=0) gracefully, returns rsScore=1 (guard at relative-strength.ts).

**Regression suite:** anytime RECONCILE_LOOKBACK_MS (7 days), BACKTEST_COSTS.slippageBps (5), GRADUATION_FLOOR_BUFFER_PCT (0.02), ENGINE_EVICTION_DELAY_MS (11 min) or any numeric constant changes, re-run full test suite (npm test / vitest) and verify equity curves, graduation math, tax-year window. Use relative assertions (`expect(count).toBeGreaterThan(0)`) or parameterize constants, not hardcoded exact counts (they grow).

### Summary: Three Layers

1. **Numeric guards:** den !== 0, !(x > 0) for money math, null not 0 for undefined, growth-factor ratios.
2. **Pure extracted functions:** isolate decision logic from I/O and engine state for fast unit tests covering all paths.
3. **Synthetic-bar test fixtures:** deterministic bars (zero-volume, gaps, plateaus, all-time-highs) stress-test edge cases before live.
