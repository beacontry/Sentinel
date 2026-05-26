# Sentinel Trading Engine — Complete Ruleset

## Overview

The trading engine scans the S&P 500, generates signals using technical analysis, applies safety filters, and executes trades through Alpaca. All rules are enforced programmatically — no manual intervention needed.

## Engine Modes

### Signal-Based Modes (scan for individual stock signals)

| Mode | Stop Loss | Take Profit | Trailing Stop | Hold Period | Position Size | Max Positions |
|------|-----------|-------------|---------------|-------------|---------------|---------------|
| Conservative¹ | 1.5% | 2% | 1% | 30 bars | From risk settings | From risk settings |
| Moderate¹ | 2% | 3% | 1.5% | 20 bars | From risk settings | From risk settings |
| **Optimized** | GA-tuned | GA-tuned | GA-tuned | GA-tuned | From risk settings | From risk settings |
| Aggressive¹ | 3% | 5% | 2.5% | 15 bars | From risk settings | From risk settings |

¹ Reachable only via adaptive — not directly user-selectable. User-facing picker shows **Optimized / Tactical / Tactical Smart / Adaptive**.

### Tactical Modes (market-level timing)

| Mode | Entry Logic | Primary Exit | Stock Selection |
|------|------------|------------|-----------------|
| **Tactical** | SPY > 50-day SMA | SPY < 20-day SMA for 3 days | Equal-weight all stocks |
| **Tactical Smart** | SPY > 50-day SMA | SPY < 20-day SMA for 3 days | Momentum + signal + inverse volatility scored |

> **Per-position safety stops still fire.** Tactical entries set `stopLoss = entry × 0.88` (12% disaster), `takeProfit = entry × 1.5`, `trailingStopPct = 11.7%`. The 1-minute `runExitCheck` runs in **every mode** — a tactical position will be sold by the stop/trail/TP path independent of SPY trend if those trigger. SPY weakness remains the primary exit; individual stops are catastrophe protection. Breakeven-promote ladder is disabled on tactical and breakeven-only on tactical-smart.

---

## Signal Generation

### Unified Signal Pipeline

The technical core is `analyzeBars()` from `src/lib/indicators/analyzer.ts` — used by the optimizer for backtests, the screener for batch scanning, and indirectly by the engine via `analyzeHybrid()`. There is no separate signal evaluator at the core layer; the engine's hybrid pipeline is a *wrapper* that starts with `analyzeBars()` output and optionally adjusts confidence (or occasionally the signal direction) using Finnhub sentiment, options flow, analyst recommendations, and AI scoring. Trader-tier users get the Finnhub layers; Premium users additionally get AI scoring; the screener + optimizer + mode-compare backtest call `analyzeBars()` directly without the hybrid layers because those layers serialize through Finnhub's 60-req/min rate limit and would block universe-wide scans.

**`analyzeBars(symbol, bars, signalParams?)`** accepts optional `SignalParams` to tune EMA periods and RSI thresholds:

```typescript
interface SignalParams {
  emaFast: number;       // default 9
  emaSlow: number;       // default 21
  rsiOversold: number;   // default 30
  rsiOverbought: number; // default 70
}
```

| Component | Function | Signal Params | Purpose |
|-----------|----------|---------------|---------|
| **Engine (optimized mode)** | `analyzeHybrid()` → `analyzeBars(symbol, bars, optimizedSignalParams)` | GA-tuned | Live trading decisions |
| **Engine (other modes)** | `analyzeHybrid()` → `analyzeBars(symbol, bars)` | Defaults | Live trading decisions |
| **Screener** | `analyzeHybrid()` → `analyzeBars(symbol, bars)` | Defaults | Batch scanning, push signals to engine |
| **Optimizer** | `analyzeSignalOnly(symbol, bars, candidateParams)` | Per-candidate | GA backtesting (lightweight variant, same logic) |
| **Mode Comparison** | `analyzeBars(symbol, bars, signalParams?)` | GA-tuned for optimized row | Backtest comparison across modes |

`analyzeSignalOnly()` is a lightweight variant that skips series building, fibonacci, reasons, and plainEnglish — same signal logic, 10-100x faster for the optimizer's thousands of evaluations per generation.

### Entry Signals (BUY / STRONG_BUY)

All conditions evaluated per stock at each scan interval:

**Indicators Used:**
- EMA crossover (fast/slow periods — default 9/21, tunable by optimizer)
- RSI (14-period, oversold/overbought — default 30/70, tunable by optimizer)
- VWAP — price above = bullish positioning
- SMA(20) — price above = bullish
- SMA(50) — alignment confirmation
- MACD histogram — positive = bullish
- Volume — above 1.5x 20-bar average = confirmed

**BUY Signal (4+ bullish indicators > bearish + 2):**
1. Price > VWAP or EMA fast > EMA slow
2. Fresh EMA crossover within lookback window
3. RSI below oversold threshold (bullish) or above 55 (momentum)
4. Price > SMA(20)
5. MACD histogram positive

**STRONG_BUY Upgrade:**
- Volume confirmed (> 1.5x average)
- Price aligned with SMA(50)

**SELL / STRONG_SELL:**
- Mirror of BUY with bearish indicators dominant

### Exit Logic

Positions are closed when ANY of these trigger:

1. **Fixed stop loss** — price drops below `pos.stopLoss`. Initialized at entry × (1 − stopLossPct); ratcheted up to entry × 1.001 once unrealized profit crosses +2% (see Breakeven-Promote below)
2. **Dynamic trailing stop** — price drops below peak × (1 - dynTrailPct)
3. **Take profit** — price exceeds entry × (1 + takeProfitPct)
4. **Sell signal** — technical analysis generates SELL/STRONG_SELL
5. **Hold period expired** — held longer than holdPeriod bars

**Dual cadence:** Exits run twice — every 15 min in the main scan (uses last-bar close), and every 1 min in `runExitCheck()` using a live quote. The 1-min loop runs in **every mode**, not just intraday — this is what keeps trailing stops tracking the live peak instead of yesterday's close. A `pendingExits: Set<symbol>` on engine state guards against the two intervals double-selling the same position.

### Dynamic Trailing Stop (Exponential Decay)

```
trail = floor + (baseTrail - floor) × e^(-3 × profitPct)
```

Values below assume `baseTrail = 12.6%` (optimized preset) and `floor = 2%` (legacy fallback — see regime note below).

| Profit | Trailing Stop | Trail-only locked-in (peak × (1−trail) − entry) |
|--------|--------------|-------------------------------------------------|
| 0% | 12.6% | — |
| 5% | 11.1% | −6.6% giveback (trail still below entry) |
| 10% | 9.9% | −0.8% giveback |
| 15% | 8.8% | +4.9% |
| 20% | 7.8% | +10.6% |
| 30% | 6.3% | +21.8% |
| 50% | 4.4% | +43.4% |

Below ~+15% profit the trail alone sits below entry — Breakeven-Promote (next section) is the layer that locks gains in that band. Above ~+15% the trail dominates and gain capture compounds.

**Floor is regime-aware.** The 2% above is the legacy fallback used when VIX is unavailable. In production with the adaptive regime classifier feeding a VIX value:

| Regime | VIX | Floor |
|---|---|---|
| Calm | ≤ 18 | **1.0%** (v3.1 — tightened from 1.5%) |
| Neutral | 18 — 25 | 2.5% |
| Panic | > 25 | **4.0%** |

**Base is volatility-aware.** With per-symbol ATR available, base trail starts at `min(25%, 2.5 × ATR / peakPrice)` rather than the preset's flat `trailingStopPct`. Capped at 25% to protect against penny-stock ATR explosions.

**Rate is momentum-aware.** Decay rate scales with RSI: strong momentum (RSI > 50) slows the tightening (let the trend run); weakening (RSI < 50) speeds it (lock before the pullback). Bounded `±30%` of the base rate of 3.

**Drawdown-from-peak tightening.** Once price has pulled back from the peak by more than 1/2 of the current trail width, an extra tightening factor kicks in — trail collapses toward floor proportionally to the pullback severity.

### Breakeven-Promote (Tiered Fixed-Stop Ratchet)

Independent of the trailing stop. As unrealized profit grows, `pos.stopLoss` ratchets up through **four tiers** — each tier locks in a portion of the gain. The dynamic trail keeps doing its thing on top; the effective stop on any scan is `max(pos.stopLoss, trailingStop)`.

**Tier ladder** (under the default `full` mode):

| Profit reached | Tier fires | `pos.stopLoss` becomes |
|---|---|---|
| +2% | Tier 1 — breakeven + slippage buffer | entry × 1.001 |
| +5% | Tier 2 — lock 2.5% | entry × 1.025 |
| +10% | Tier 3 — lock 5% | entry × 1.05 |
| +15% | Tier 4 — lock 7.5% | entry × 1.075 |
| > +15% | (no higher tier) — dynamic trail takes over | entry × 1.075 |

The ladder is one-way: `pos.stopLoss` only moves up. If a position skips intermediate tiers (gap up overnight, fast intraday run), the highest qualifying tier fires directly — no need to wait for each rung in sequence.

**Per-mode opt-out** — `MODE_LADDER_DEFAULT`:

| Engine mode | Ladder mode | Why |
|---|---|---|
| conservative / moderate / aggressive / optimized | `full` | All four tiers active. Locking gains progressively matches the strategy intent |
| tactical-smart | `breakeven_only` | Only the +2% tier fires. Higher tiers would prematurely exit positions that the strategy expects to hold for 30%+ moves |
| tactical | `disabled` | Pure SPY-driven; individual position management contradicts "all in / all out" philosophy |
| adaptive | resolves to effective mode at scan time | (the current effective mode's default applies) |

**Combined picture** — what actually decides the exit at each profit level, under `full` ladder:

| Profit reached | Effective fixed stop | Effective trailing stop | Exit decided by |
|---|---|---|---|
| 0% | entry × (1 − stopLossPct) | peak × (1 − 12.6%) ≈ entry × 0.874 | fixed (peak ≈ entry) |
| +1.9% | entry × (1 − stopLossPct) | ~entry × 0.91 | fixed (no promote yet) |
| **+2.0%** | **entry × 1.001 ← tier 1** | ~entry × 0.91 | fixed (now at breakeven) |
| **+5%** | **entry × 1.025 ← tier 2** | ~entry × 0.94 | fixed (lock 2.5%) |
| **+10%** | **entry × 1.05 ← tier 3** | ~entry × 1.005 | fixed (lock 5%) |
| **+15%** | **entry × 1.075 ← tier 4** | ~entry × 1.07 | fixed/trail roughly tied |
| +20% | entry × 1.075 | ~entry × 1.134 | trail (locks in 13.4%) |
| +50% | entry × 1.075 | ~entry × 1.464 | trail (locks in 46.4%) |

**Why this matters for tactical-smart specifically:** entries init the disaster stop 12% below entry. Before this layer, a position that ran +3% and reversed gave back the gain plus 12% before the fixed stop caught it. With `breakeven_only`, it now caps at ~breakeven once initial conviction is shown — without prematurely exiting positions that could run to the 50%+ take-profit target.

**Why this doesn't break the dynamic-trail formula:** the trail math is untouched. Below ~+15% profit (under `full`), the ladder dominates because the trail still allows a meaningful giveback. Above ~+15%, the trail is tighter than the highest tier's lock so the trail wins and gain capture continues smoothly.

**Idempotent.** Once promoted to a tier, `pos.stopLoss` stays at or above that tier's target for the rest of the position's life. The trail can ratchet it higher; nothing lowers it.

### Take-Profit Graduation (`MODE_GRADUATION_DEFAULT`)

For modes where graduation is enabled (**tactical-smart** and **optimized** — set in `MODE_GRADUATION_DEFAULT`), the `pos.takeProfit` threshold is no longer a hard exit. It's a graduation point:

1. **First crossing** → lock `pos.stopLoss` to entry × 1.30 (the +30% graduation floor). Idempotent — never lowers an existing higher stop, so a trail that already passed +30% stays where it is.
2. **Subsequent scans** → `shouldGraduateExit()` evaluates 3 weakness signals:
   - Volume contraction: 5-day avg < 20-day avg × 0.85
   - Plateau: currentPrice within 2% of 10-bar peak (and not extending — distFromPeak ≥ 0)
   - RSI rollover: `rsi_14 < 60` (was overbought, no longer)
3. **2-of-3 fires** → exit with reason like `Graduated exit at +X%: N/3 weakness signals`. Otherwise hold; normal stop_loss + trailing + SELL signal still apply via the exit chain (which is wrapped in `if (!shouldExit)` so graduation's reason isn't overwritten).

| Engine mode | Graduation | Why |
|---|---|---|
| tactical-smart | `enabled` | Original mode (PR 8). Designed around the runner-friendly philosophy |
| optimized | `enabled` | Enabled in PR 14. GA-tuned takeProfit was too tight on out-of-sample momentum runs; graduation lets winners ride past the training-window-fit exit |
| conservative / moderate / aggressive | `disabled` | Want the predictable hard cap, not unbounded upside |
| tactical | `disabled` | SPY-driven; no per-symbol management |
| adaptive | `disabled` | Resolves to effective base mode at runtime |

**Why graduation wins on runners:** a position that crosses +50% in a momentum environment historically came from either (a) a stock that's still trending or (b) a stock about to mean-revert. The +30% floor protects against (b) — worst case, you lock in +30%. The weakness signals catch (b) early. Case (a) — the stock keeps running — gets to ride. Pre-graduation, all (a) cases got clipped at the GA-found exit point.

---

## Exit Behavior by Mode

Exit logic varies dramatically between mode families. Signal-based modes (like Optimized GA) manage each position independently with multiple exit triggers. Tactical modes treat the portfolio as a unit — all in or all out based on SPY health.

### Comparison

| Aspect | Optimized GA | Tactical Smart | Tactical |
|--------|---|---|---|
| **Exit scope** | Individual position + post-exit redeploy | Portfolio-wide + individual swaps | Portfolio-wide only |
| **Primary exit** | First of 5 conditions fires | SPY < 20-SMA for 3 days | SPY < 20-SMA for 3 days |
| **Stop loss** | ~8.5% initial → 4-tier ladder (+2/+5/+10/+15%) locks in 0.1 / 2.5 / 5 / 7.5% | 12% initial → +2% tier only (breakeven_only) | None (SPY-driven exits) |
| **Take profit** | ATR × mult or % (GA-tuned, **graduates instead of exits**) | 50% (graduates to +30% floor) | None (SPY-driven exits) |
| **Trailing stop** | ~12.6% base, tightens with profit | 11.7% base, tightens with profit | None (SPY-driven exits) |
| **Hold period** | ~33 days (GA-tuned) | 999 days (effectively never) | None (SPY-driven exits) |
| **Sell signal** | SELL/STRONG_SELL → exit position | SELL/STRONG_SELL → swap for stronger stock | Not used |
| **Universe** | SCAN_UNIVERSE + top-50 screener externals (by confidence) | SCAN_UNIVERSE + top-50 screener externals | SCAN_UNIVERSE only |
| **Market regime** | SPY < SMA(20) blocks new buys only | SPY < SMA(20) ×3d → liquidate ALL | SPY < SMA(20) ×3d → liquidate ALL |
| **Active management** | Yes — swap-sell redeploys freed capital | Yes — swap weak, add strong (pair-wise) | No — full in or full out |
| **Signal params** | GA-tuned (EMA/RSI per-symbol) | Default (EMA 9/21, RSI 30/70) | Not applicable |
| **Position sizing** | Fixed positionPct × equity | Inverse-volatility weighted | Equal weight |
| **GA fitness** | excessReturn × sharpeMult × drawdownMult | N/A (no GA) | N/A |

### Optimized GA — Individual Exits + Post-Exit Redeploy

Each position is managed independently. On every scan (~15 min), the engine checks 5 exit conditions in priority order. First trigger wins:

1. **Stop loss** — price ≤ entry × (1 − stopLossPct). GA-tuned, typically ~8.5%
2. **Take profit** — price ≥ entry + ATR(14) × multiplier (adaptive) or entry × (1 + takeProfitPct) (fallback). **Graduates instead of exits**: first crossing locks `pos.stopLoss` to entry × 1.30 (the +30% floor). Subsequent scans hold until weakness signals fire (2-of-3: volume contraction, plateau, RSI rollover). See § Take-Profit Graduation.
3. **Trailing stop** — price ≤ peak × (1 − dynamicTrailPct). Tightens exponentially as profit grows (see Dynamic Trailing Stop)
4. **Hold period** — position held ≥ holdPeriod trading days. GA-tuned, typically ~33 days
5. **SELL/STRONG_SELL signal** — `analyzeBars()` with GA-tuned signal params scores bearish

SPY health filter only blocks new entries (SPY < SMA(20)), does NOT force exits of held positions.

**Post-exit redeploy (swap-sell, PR 14).** When an in-loop exit fires, the freed slot doesn't sit idle until the next 15-min tick. Any STRONG_BUY candidates that hit the position cap before the exit happened are deferred during the scan; after the per-symbol loop ends, the top deferred candidates (by analyzer confidence) get bought to redeploy that capital. Closes a stair-step of ~5-15% per cycle that was previously lost waiting for the next scan. Gated by `MODE_SWAP_SELL_DEFAULT` — opt-in per mode. Optimized enabled; tactical-smart uses its own pair-wise swap-sell elsewhere.

**Universe (PR 14).** Now consumes the screener feed alongside SCAN_UNIVERSE — same `selectExternalSymbolsForTactical` helper as tactical-smart (top-50 by confidence, BUY/STRONG_BUY only, dedup'd against the hardcoded universe). Previously took every external signal regardless of direction or confidence, no cap.

**Multi-objective GA fitness (PR 14).** `blendedFitness` now scales `excessReturn` by two risk multipliers:
- `sharpeMult = min(sharpe / 1.0, 1.0)` — penalizes Sharpe < 1.0 proportionally
- `drawdownMult = max(0, 1 − maxDrawdown / 0.20)` — zeroes at 20% drawdown

Pushes the GA away from blow-up-risk parameter sets that score high on raw return alone. Re-run the optimizer after deploy to retune existing strategies with the new fitness.

### Tactical Smart — Market Regime + Active Swapping

Two layers of exit logic:

**Layer 1 — SPY Weakness (portfolio-wide):**
SPY closes below its 20-day SMA for 3 consecutive trading days → sell ALL positions immediately at market. No graduated exit. This is the primary exit mechanism and overrides everything else.

**Layer 2 — Active Management (while SPY is healthy):**
While invested and SPY is above the 50-day SMA, the engine scans every 15 minutes:
- Identifies held positions with SELL/STRONG_SELL signals (weak stocks)
- Finds STRONG_BUY candidates not already held (strong replacements)
- Sells weak positions at market → buys replacements at limit
- Can also add new STRONG_BUY positions if cash is available (up to 1.5× maxPositions)

Individual stop/TP/trail levels exist (12% stop, 50% TP, 11.7% trail) but with a 999-day hold period, the SPY weakness trigger almost always fires before individual position exits.

### Tactical — Pure Market Timing

Simplest exit logic of all three modes:

- **Only exit trigger:** SPY closes below its 20-day SMA for 3 consecutive days
- **Action:** Market-sell ALL positions to 100% cash immediately
- No individual position management, no stop losses, no trailing stops, no sell signals
- No swapping or active management while holding
- Full in or full out — the only decision is SPY trend direction

Re-entry occurs when SPY recovers above the 50-day SMA (or above 20-SMA with RSI < 40).

---

## Pre-Buy Safety Filters

Every buy signal passes through a layered gate sequence before an order is placed.

> **Two stages, two scopes.** `runScan()` calls `passesSmartFilters()` (RS + bearish sentiment) BEFORE `canPlaceBuyOrder()`. Tactical and tactical-smart skip the smart-filter step (they have their own scoring) and call `canPlaceBuyOrder()` directly. Both paths run the same risk-side gates inside `canPlaceBuyOrder()`: **earnings blackout → sector exposure → wash-sale → PDT → daily notional cap → order rate limit**. First failing gate is what the audit log records.

Reference list of all gates a main-scan BUY traverses:

### 1. Market Hours
- **Rule:** Only trade 9:30 AM – 4:00 PM ET, Monday – Friday
- **Action:** Skip scan entirely outside hours

### 2. SPY Market Health Filter
- **Rule:** SPY must be above its 20-day SMA
- **Action:** Block ALL buy signals when SPY is below SMA(20)
- **Source:** Yahoo Finance daily bars for SPY

### 3. Earnings Blackout
- **Rule:** Don't buy within 5 trading days of earnings announcement
- **Action:** Skip symbol if earnings date is within [-1, +5] days
- **Source:** Finnhub Earnings Calendar API (cached daily)
- **Fallback:** Allow trade if Finnhub unavailable

### 4. Relative Strength
- **Rule:** Don't buy stocks with negative 60-day momentum (down >5%)
- **Action:** Skip symbol if 60-day return < -5%
- **Source:** Calculated from Yahoo Finance daily bars (already fetched)

### 5. News Sentiment
- **Rule:** Don't buy when news sentiment is strongly bearish
- **Action:** Skip symbol if Finnhub bullish% < 30%
- **Source:** Finnhub News Sentiment API (cached daily)
- **Fallback:** Neutral (0.5) if Finnhub unavailable

### 6. Signal Cooldown
- **Rule:** Don't re-buy same symbol within 2.5 hours
- **Action:** Skip if same symbol had a buy signal within 150 minutes
- **Implementation:** Stored in a dedicated `cooldowns: Map<symbol, timestamp>` on engine state with a 150-min cleanup pass. The previous design piggybacked on the `externalSignals` queue, which gets filtered every scan to drop entries older than 30 min — silently truncating the intended 150-min window.
- **Mode coverage:** Applied in `runScan` (signal-based modes). Tactical Smart's active-management branch uses a different deduplication path — see "Held-symbol detection" in Tactical Smart Mode Rules.

### 7. Max Positions
- **Rule:** Don't exceed maxPositions from risk settings
- **BUY signals:** Blocked when open positions >= maxPositions
- **STRONG_BUY signals:** Can exceed maxPositions by up to 50% (e.g., maxPositions=13 → cap of 19 for strong signals)
- Exposure and cash checks still apply even when STRONG_BUY overflow is allowed

### 8. Max Portfolio Exposure
- **Rule:** Don't exceed total exposure limit from risk settings
- **Action:** Skip if current exposure + new position > maxExposure

### 9. Daily Loss Halt
- **Rule:** Stop all trading if daily losses exceed configured % of equity
- **Action:** Halt engine, cancel all pending orders
- **Source:** User risk profile in DB (default 2%)

### 10. Pending Order Check
- **Rule:** Don't buy a symbol that already has a pending buy order on the broker
- **Action:** Engine fetches open orders from Alpaca at each scan cycle; skips any symbol with an existing pending buy order (status: new, accepted, partially_filled, held)
- **Benefit:** Prevents duplicate buy orders after engine restarts, avoids tying up buying power with conflicting orders
- **Mode coverage:** Both `runScan` (signal-based modes) and `runTacticalSmartScan` fetch open orders and union pending-buy symbols into the held-symbols check. Without this, a limit order from the previous scan that hasn't filled yet would re-trigger because `getPositions()` only returns filled positions.

---

## Order Execution

### Entry Orders
- **Type:** Limit order (0.1% above current price). Plain order — **not** a bracket. Stops/TPs are managed by the engine, not by Alpaca-side OCO legs.
- **Time in force:** Day (expires at market close)
- **Broker-side stop:** Placed separately via `syncBrokerStops()` on the next scan after the buy fills. Acts as a crash-safe fallback if the engine goes offline.

### Position Sizing
- **Method:** Risk-based from user risk profile
- **Per position:** positionPct × total equity (default 15%)
- **Max shares:** min(risk-based qty, maxPositionSize from risk settings)
- **Max positions:** from risk overrides (default 16), STRONG_BUY can overflow by 50%

### Exit Orders
- **Type:** Market order (immediate execution)
- **Trigger:** Any exit condition met during scan

---

## Safety Systems

### Paper Mode Enforcement
- Engine refuses to start if broker connection is "live" environment
- Only "paper" connections allowed

### Dual-Layer Stop Protection

**While engine is running (protective stops):**
- Gain-aware GTC stop orders on Alpaca for every position
- Computes `max(disasterStop, trailingStop, fixedStop)` using current broker price as peak
- Positions with unrealized gains get tight trailing stops (not flat 18% from entry)
- `syncBrokerStops()` runs every scan cycle and ratchets stops up (never down) as price rises
- Dynamic trail: starts at base% (e.g. 9%), exponentially decays toward 2% floor as profit grows

**When engine is stopped (safety stops):**
- Tighter strategy-level GTC stops (~8.5% from optimizer) placed on Alpaca
- More protective since the engine won't be managing exits
- Placed automatically when engine is stopped or halted

**Transition:**
- **On engine start:** `placeDisasterStops()` cancels old stops → waits for shares to release → places gain-aware protective stops
- **While running:** `syncBrokerStops()` updates stops every scan to match dynamic trailing
- **On engine stop:** `placeSafetyStops()` cancels protective stops → waits for shares to release → places ~8.5% safety stops

**Cancel-and-wait (`cancelAllAndWait`):** Both stop-placement paths cancel existing orders, then poll `getOrders()` every 250ms (5s deadline) until no orders remain in `new / accepted / pending_new / partially_filled / held / pending_cancel`. Alpaca's `DELETE /v2/orders` ack is asynchronous — the response returns before shares actually release from `held_for_orders`. Without this wait, immediately placing a fresh sell stop fails with `403 code 40310000 "insufficient qty available"` because every share is still locked under the prior stop.

### Auto-Restart After Deploy
- On container start, `instrumentation.ts` waits 5s for the DB pool, then runs `bootEngines()` which iterates every user with an active broker connection and calls `autoStartIfNeeded()` — engine resumes without waiting for a user to open the dashboard
- Transient broker/DB errors retry up to 3 times with 2s/4s backoff before giving up at error level
- If positions exist → auto-starts in the last used mode (from `traderStatus.mode` in DB)
- Syncs broker positions into in-memory map so the engine immediately resumes dynamic management (trailing stops, exits, etc.)

### Graceful Shutdown
- SIGTERM and SIGINT handlers in `instrumentation.ts` call `shutdownAllEngines()` — for each running engine: clear scan/exit-check intervals, then run `placeSafetyStops()` so every position has a tighter GTC stop on Alpaca before the process exits
- Hard 8s budget (under podman's 10s grace period) — if the broker is slow, force-exit rather than block the rebuild

### Daily-Loss Halt & Auto-Recovery
- When daily realized losses exceed `dailyLossPct` of equity, the engine sets `halted=true` and stops opening new positions
- On the next trading day's first scan, the date-rollover block clears the halt automatically and prunes the daily-loss error from `engine.errors` — no manual restart needed
- Applies to all three scan functions: `runScan`, `runTacticalScan`, `runTacticalSmartScan`

### Long-Only Enforcement
- Engine never opens shorts — entry logic only fires on BUY/STRONG_BUY
- If a short shows up on the broker (manual order, external tool), `syncPositionMapFromBroker()` filters it out so long-only stop math doesn't get applied wrong-direction to it
- Screener no longer pushes SELL/STRONG_SELL into the engine queue

### Exit Race Protection
- The 1-min live-quote exit check and the 15-min main scan both call `placeOrder({side:"sell"})` — without coordination, both could fire on the same position during the window between `placeOrder()` and `positionMap.delete()`
- `pendingExits: Set<symbol>` on engine state gates both code paths — `add()` before placing the sell, `delete()` in `finally`
- Prevents the double-sell that previously surfaced as Alpaca rejecting a second order with "insufficient qty"

### Mode Persistence
- Current engine mode saved to `traderStatus.mode` on every heartbeat
- Format: `paper:optimized`, `paper:tactical`, etc.
- Auto-restart reads last mode from DB
- Valid modes for auto-restart: conservative, moderate, optimized, aggressive, tactical, tactical-smart, adaptive

### Position Reconciliation
- On each scan cycle, the engine compares its in-memory position map against actual broker positions
- If a position exists in memory but not on Alpaca (manual sell, external closure), it is removed
- This frees up slots for new buys and keeps the engine in sync with reality
- Runs in all three scan modes: signal-based, tactical, and tactical-smart

---

## Tactical Mode Rules

### Entry (Full In)
- **Trigger:** SPY closes above 50-day SMA
- **Action:** Buy equal-weight positions across S&P 500 stocks
- **Sizing:** Equal allocation up to maxPositions

### Exit (Full Out)
- **Trigger:** SPY closes below 20-day SMA for 3 consecutive days
- **Action:** Sell ALL positions at market
- **No graduated exit:** Full in or full out (simple beats clever)

### Re-Entry
- **Trigger:** SPY recovers above 50-day SMA
- **RSI filter:** Can also re-enter if SPY > 20 SMA and RSI(14) < 40

### Daily P&L Tracking
- Every scan cycle (`runScan`, `runTacticalScan`, `runTacticalSmartScan`) calls `upsertDailyPnl` with realized P&L deltas, trade-count deltas, and the latest unrealized snapshot
- The 1-min `runExitCheck` loop also records `(realizedPnl, +1 trade)` after every successful exit so stop-loss / trailing-stop hits between main scans don't disappear from the dashboard
- `upsertDailyPnl(unrealizedPnl)` accepts `null` to mean "preserve existing" — used by per-trade callers that don't have a fresh broker snapshot
- Daily P&L is recorded for the P&L Calendar and performance tracking

---

## Tactical Smart Mode Rules

### Entry (Scored)
- **Trigger:** Same SPY conditions as Tactical
- **Stock selection:** Score each stock by:
  - Momentum (3-month return) × 300
  - Signal score (STRONG_BUY=4, BUY=2, HOLD=0, SELL=-2)
  - Screener boost (external STRONG_BUY +3, BUY +1)
  - Confidence × 2
- **Sizing:** Inverse volatility weighted (stable stocks get more capital)
- **Filter:** Skip stocks with negative momentum

### Active Management (while holding)
When invested and SPY is healthy, the engine actively manages the portfolio every 15 minutes:

**Held-symbol detection:**
The "candidate not already held" check unions three sources:
- broker `getPositions()` — confirmed holdings
- in-memory `positionMap` keys — limit orders just placed by the same scan
- pending buy orders from `getOrders()` — limit orders from prior scans not yet filled

Without all three, a limit buy placed at scan T can be missing from `getPositions()` at scan T+15min while still being a real intent — the symbol would re-qualify as a candidate and get bought again. (See incident notes for the duplicate CIEN buy that motivated this.)

**Swaps (sell weak → buy strong):**
- Scans all held positions for SELL/STRONG_SELL signals
- Scans universe + external screener for STRONG_BUY candidates not already held
- Sells weak positions at market, buys replacement at limit (0.1% above current)
- Logged as `tactical_smart_swap_sell` / `tactical_smart_swap_buy`
- Each sell increments `realizedPnlThisScan`; both legs increment `tradesThisScan`

**Additions (deploy unused cash):**
- Remaining STRONG_BUY candidates can be added if cash is available
- Respects 1.5× maxPositions hard cap (same as STRONG_BUY overflow)
- Respects max exposure limit
- Logged as `tactical_smart_add`, increments `tradesThisScan`

**Tactical exit (full liquidation on SPY weakness):**
- Each `tactical_exit` sell adds `pos.unrealizedPnl` to `realizedPnlThisScan` and increments `tradesThisScan`

**Signal logging:**
- Top 5 STRONG_BUY candidates are logged to signals table for visibility even if not acted on

### Exit
- Same as Tactical (full exit on SPY weakness)

---

## Screener → Engine Signal Flow

The screener (`src/lib/screener.ts`) is a shared, user-independent market scanner that feeds signals to the trading engine.

### How It Works

1. **Daily scan** at market open: fetches 90-day bars for the symbols mapped in `src/lib/sectors.ts` (~150 across all sectors as of May 2026), runs `analyzeHybrid()` with default signal params
2. **Intraday scan** every 5 minutes: fetches 5-min bars (2 days), same pipeline
3. **Push to engine:** actionable signals (BUY/STRONG_BUY with confidence ≥ 0.6) auto-pushed via `pushExternalSignal()` (per-user) or `broadcastExternalSignal()` (across all running engines)
4. **Dedup:** same symbol+signal ignored within 30 minutes
5. **Expiry:** external signals expire after 30 minutes
6. **Universe:** review on quarterly S&P 500 rebalance (Mar/Jun/Sep/Dec) — `sectors.ts` is hand-maintained, not auto-synced from Wikipedia

### How Each Mode Consumes Screener Signals

| Mode | Consumes? | How |
|------|-----------|-----|
| Conservative | Yes | External signal symbols added to scan universe; if signal matches, can trigger entry |
| Moderate | Yes | Same |
| Optimized | Yes | Same |
| Aggressive | Yes | Same |
| Tactical | **No** | Ignores screener — pure SPY timing |
| Tactical Smart | **Yes** | Boosts candidate scores during stock selection (STRONG_BUY +3pts, BUY +1pt) |

### Key Properties

- **Long-only:** only BUY and STRONG_BUY are pushed to engines. SELL/STRONG_SELL are dropped at the screener boundary — the engine ignores them anyway, so they were just noise.
- **Confidence floor:** 0.6 minimum — weaker signals are filtered out before reaching the engine
- Screener always uses **default** signal params (EMA 9/21, RSI 30/70) — not optimizer-tuned
- Screener signals are **in-memory only** (not persisted to DB) — lost on container restart
- Screener is **shared across all users** — not per-tenant

---

## Data Sources

| Source | Data | Used For | Caching |
|--------|------|----------|---------|
| **Yahoo Finance** | Daily/5-min bars, quotes | Signal generation, momentum | Incremental (only new days) |
| **Finnhub** | Earnings calendar | Earnings blackout filter | Daily |
| **Finnhub** | News sentiment | Sentiment gate | Daily |
| **Finnhub** | Fallback bars | Backup data source | Per request |
| **Wikipedia** | S&P 500 constituents | Universe auto-update | Daily |
| **Alpaca** | Account, positions, orders | Execution, P&L | Real-time |

---

## Optimizer → Engine Flow

### 8 Optimizable Parameters

The optimizer tunes 8 parameters via genetic algorithm:

| Parameter | Range | Type | Used For |
|-----------|-------|------|----------|
| stopLossPct | 1–12% | Exit | Fixed stop loss from entry |
| takeProfitAtrMult | 3–15× | Exit | Adaptive TP: entry + ATR(14) × multiplier |
| trailingStopPct | 1–15% | Exit | Trailing stop base width (tightens with profit) |
| holdPeriod | 5–60 days | Exit | Max hold before forced exit |
| emaFast | 5–15 | Signal | Short-term EMA period |
| emaSlow | 15–50 | Signal | Long-term EMA period |
| rsiOversold | 20–40 | Signal | RSI oversold threshold |
| rsiOverbought | 60–80 | Signal | RSI overbought threshold |
| rsThreshold | -20% to +10% | Filter | 60-day relative strength gate |

**Adaptive take profit:** Instead of a fixed percentage from entry, the optimizer tunes an ATR multiplier. At entry, `takeProfit = entryPrice + ATR(14) × multiplier`. Volatile stocks (high ATR) get wider targets; stable stocks get tighter targets. This prevents capping upside on momentum stocks while still taking profits on range-bound ones.

Position sizing (positionPct, maxPositions) is NOT optimized — it belongs to user risk profiles.

### Parameter Flow

```
Optimizer completes GA run
  → saves bestParams (8 fields) to optimization_runs.bestParams (JSONB)
    ↓
Engine loads latest completed run every 5 minutes (cached)
  → Extracts exit params: stopLossPct, takeProfitAtrMult, trailingStopPct, holdPeriod
  → Extracts signal params: emaFast, emaSlow, rsiOversold, rsiOverbought
  → Extracts filter params: rsThreshold
  → Computes ATR-based take profit per position at entry time
    ↓
Per-symbol overrides from Strategies page take priority over GA params
```

### Screener vs Engine Authority

The screener only pushes BUY/STRONG_BUY signals to the engine — never SELL signals. Once a position is entered, it is managed entirely by the engine's exit logic (stop loss, trailing stop, ATR-based take profit, sell signal from `analyzeHybrid()`, hold period). The screener has no influence on exits.

### Which Modes Use Optimizer Params

| Mode | Signal Params (EMA/RSI) | Exit Params | Take Profit | RS Threshold | Screener |
|------|------------------------|-------------|-------------|-------------|----------|
| Conservative¹ | Defaults | Hardcoded preset | Fixed % | From optimizer | Yes |
| Moderate¹ | Defaults | Hardcoded preset | Fixed % | From optimizer | Yes |
| **Optimized** | **GA-tuned** | **GA-tuned** | **ATR × mult** | **GA-tuned** | Yes |
| Aggressive¹ | Defaults | Hardcoded preset | Fixed % | From optimizer | Yes |
| Tactical | N/A (SPY only) | GA or swing preset | Fixed % | N/A | No |
| Tactical Smart | Defaults | GA-tuned | Fixed % | N/A | **Yes (boost)** |

¹ Adaptive-only — see top-of-doc footnote.

**Note:** rsThreshold affects ALL standard modes via `passesSmartFilters()`, not just optimized mode. Tactical modes don't use smart filters.

### Mode Comparison Integration

The Mode Comparison backtest uses `analyzeBars()` for all modes. The Optimized (GA) row passes the optimizer's signal params (emaFast/emaSlow/rsiOversold/rsiOverbought) through to `analyzeBars()`. All other rows use default indicator params. This ensures the comparison honestly reflects what each mode does in production.

### Optimizer Diversity Mechanisms

The GA search uses lightweight diversity controls to avoid getting stuck in local optima without overwhelming good solutions with random noise:

- **Diversity measurement:** Average normalized Euclidean distance across sampled parameter pairs (0 = identical clones, ~1 = max spread). Logged per generation.
- **Adaptive mutation:** Rate scales from 10% (healthy, diversity > 0.35) → 20% (baseline) → 50% (collapsed, diversity < 0.10)
- **Random immigrants:** 5% of each generation replaced with fresh random individuals — enough to inject new genes without dragging down the average
- **Stagnation restart:** After 8 gens without improvement (< 0.01% gain), inject 15% immigrants + force max mutation. Resets when improvement resumes.
- **Convergence chart:** Best, average, and diversity lines shown per generation on the optimizer dashboard

Diversity is purely a GA search mechanism — it has no effect on live trading. It controls how the optimizer explores the 8-dimensional parameter space to find the best strategy.

## Risk Overrides (from DB)

All fields are optional/nullable. Empty fields mean "engine decides" — the engine uses its code defaults. Only user-set fields impose limits. Configurable from Trader page → Risk Settings.

| Setting | Engine Default | Engine Field | Notes |
|---------|---------------|-------------|-------|
| Max Open Positions | 16 | maxPositions | STRONG_BUY can overflow by 50% |
| Max Position % of equity | 15% | positionPct | Per-position allocation |
| Max Daily Loss % | 2% | dailyLossPct | Triggers daily loss halt |
| Max Position Size (shares) | 100 | maxPositionSize | Hard cap per order |
| Max Exposure | $25,000 | maxExposure | Total portfolio exposure cap |
| Account Size | (from broker) | accountSize | Overrides broker-reported balance |
| Max Drawdown % | (none) | maxDrawdownPct | Optional circuit breaker |
| Max Daily Notional % | 100% | maxDailyNotionalPct | Phase 3 circuit breaker — gross BUY notional / day as fraction of bootEquity |
| Max Consecutive Losses | 5 | maxConsecutiveLosses | Phase 3 circuit breaker — halt after N losing trades in a row (resets on any winner) |

Updated on every scan cycle — changes take effect within 15 minutes.

---

## Live Trading Mode

The engine code is **100% identical between paper and live**. The only environment-specific code is the Alpaca client constructor (picking the base URL), the boot-time env gate, and the UI banner. Signal generation, order construction, stop calculation, and all five circuit breakers (below) operate identically in both environments.

**Boot gate.** Two gates, both must pass:

1. **`ALLOW_LIVE_TRADING=1`** (env). Set in `/opt/apps/sentinel/.env` on the droplet. Without it, any `environment="live"` boot is refused — emits `engine.live_blocked` audit row with `metadata.reason="ALLOW_LIVE_TRADING_not_set"`.

2. **`users.live_trading_enabled === true`** (DB column). Admin-grantable per-user permission. The engine reads this on every live boot attempt; if `false`, emits `engine.live_blocked` with `metadata.reason="user_not_granted_live"`. **Fail-closed**: a DB read failure on this gate also refuses the boot — env-only unlock is not enough.

When both gates pass, every live boot fires a warn-level log, captures `metadata.environment="live"` on the `engine.started` audit row, and the Trader UI shows a persistent red **LIVE** banner with last-4 of the broker account number.

**Paper vs live outcomes.** Same code, different broker reality. Live will have lower fill rates on limit BUYs (paper fills aggressively), real slippage on market sells (paper compresses to zero), partial fills on larger orders, more rejections (PDT, buying-power strictness, wash-sale flags, halted symbols), T+1 settlement timing, real 18% stop slippage on volatile names, and PDT lock risk on accounts under $25k. Paper trading is a faithful test of signal quality and risk-profile sizing; it is **not** a test of fill quality, slippage, or PDT survival.

## Capital Circuit Breakers (Phase 3)

Five auto-halt or auto-block conditions layered on top of the existing safety systems. All operate identically in paper and live. Each emits a distinct audit reason so the audit viewer can filter cause.

| # | Breaker | Trigger | Effect | Audit reason |
|---|---------|---------|--------|--------------|
| 1 | **Daily notional cap** | Gross BUY notional / day > `maxDailyNotionalPct × bootEquity` | Block BUY | `daily_notional_cap_exceeded` |
| 2 | **Order rate limit** | 30 orders within 60s sliding window | Block order | `order_rate_limit_exceeded` |
| 3 | **Broker auto-halt** | 5 consecutive `getPositions()` failures | Halt engine (Stop+Start to clear) | `engine.halted` reason=`broker_unreachable` |
| 4 | **Account-switch detection** | Different `account_number` OR equity drop > 50% from boot snapshot | Halt engine | `engine.halted` reason=`account_mismatch` or `equity_collapse` |
| 5 | **Consecutive-loss halt** | N losing trades in a row (default 5, configurable) | Halt engine | `engine.halted` reason=`consecutive_losses` |

**Gate ordering inside `canPlaceBuyOrder()`**: wash-sale → PDT → daily notional → rate limit. Cheapest checks fire first; the first reason found is what's logged. **SELLs (exits) are never blocked** — exiting a position takes priority over any safeguard.

## Tax & PDT Protections (Phase 5)

Three personalized protections that vary by account state and user election.

**§475(f) MTM toggle** — Trader page renders a "Tax election" card with a single checkbox. Writes to `user_tax_status` table via `PUT /api/tax-status`. Engine reads at `startEngine()` via `loadTaxStatus(userId)`. Unchecked = wash-sale protection ON. Checked = OFF (MTM traders are exempt from §1091). Self-attestation only — Sentinel does not file or validate with the IRS.

**Wash-sale protection** — When MTM is unchecked, the engine blocks BUYs on any symbol with a losing exit (`action IN ('SELL','manual_close') AND pnl < 0`) in the last **31 calendar days** (one day past IRS for safety). One batched DISTINCT query per scan, cached on engine state for 5 min, O(1) lookup per BUY. Symbol-level (not lot-level) — partial losing close blocks the whole ticker for 31 days. Does NOT catch: manual buys via Alpaca's UI (not visible at order time), "substantially identical" ETFs (SPY ↔ IVV), different share classes. Audit reason: `wash_sale_protection`.

**PDT protection** — Auto-detected from `account.equity < $25,000`. Three behaviors:

1. **Boot mode-refusal**: previously refused `intraday` mode when PDT-vulnerable. Intraday mode has since been removed entirely (v3.1); the boot refusal is gone with it.
2. **Mid-session re-evaluation**: every scan calls `evaluatePdtState()` against live equity + `daytradeCount`. Transition not-vulnerable → vulnerable emits one `engine.pdt_vulnerable` informational audit row (no halt) and flips the UI warning.
3. **Buy-block**: `pdtVulnerable && daytradeCount >= 3` (one shy of the 4-trade flag) blocks all new BUYs. SELLs always allowed.

## Audit Log (Phase 2)

Append-only, hash-chained record of every privileged action. Schema in `drizzle/0016_audit_log.sql`; helper in `src/lib/audit.ts`; admin viewer at `/dashboard/admin/audit`.

**Hash chain**: each row's `hash = sha256(prev_hash || created_at || actor_user_id || action || resource_type || resource_id || canonical_json(metadata))`, joined by NUL byte separator (impossible to occur in UTF-8 fields, prevents field-confusion/length-extension). Canonical-JSON sorts keys at every depth so equivalent objects hash identically. Genesis row's `prev_hash` is the literal `"GENESIS"`.

**Write path**: `writeAudit()` opens a Postgres transaction, takes `pg_advisory_xact_lock(8493920100)` (auto-released on commit), reads the tail row's hash, computes the new hash, inserts. Concurrent writers serialize on the lock so the chain can't fork. The helper **never throws** — failures log and return null. Audit problems must not cascade into request failures.

**What's logged**: `auth.login_success` / `login_failed` (attacker IP captured via X-Forwarded-For); `auth.user_registered`; `invite.sent` / `invite.consumed`; `broker.connection.created` / `.updated` / `.deleted` (rotated secrets flagged in metadata, never logged in plaintext); `engine.started` / `.stopped` / `.halted` / `.mode_switched`; `engine.live_blocked`; `engine.pdt_vulnerable`; `order.placed` / `.rejected` (with safeguard reason); `risk_profile.updated` (field-level diff); `system_config.updated` (key name + actor + whether prior value existed — never the value itself); `user.profile_updated` (ToS acceptance, future user-profile mutations).

**Verification**: `/dashboard/admin/audit` has a "Verify chain" button that calls `POST /api/admin/audit/verify`. Walks every row in id order, recomputes each hash. Returns "intact" or the first row where the chain breaks. ~2s per 100k rows.

## Going Live & Rollback

**Going live**:

1. Tighten risk profile (Trader page → Risk Settings). For $5k cash-only: `maxPositionPct=25-33%`, `maxDailyLossPct=2%`, `maxDailyNotionalPct=0.5`, `maxConsecutiveLosses=3`.
2. Add live broker connection (Settings → Add Broker). Environment=Live, type "LIVE" to confirm, Test, Save.
3. Deactivate paper connection (`isActive=false`).
4. Flip env-gate on droplet — `ALLOW_LIVE_TRADING=1` in `/opt/apps/sentinel/.env`, then `podman stop && rm && run` (restart does NOT re-read env-file).
5. Start engine in any user-facing mode (optimized / tactical / tactical-smart / adaptive). Intraday is no longer available.

**Rollback** (cheapest first):

- **A. Env-only**: clear `ALLOW_LIVE_TRADING`, recreate container. Engine refuses live; live broker row stays for re-enable later.
- **B. Code revert**: `git revert` phase commits in reverse order (4 → 3 → 2). Migrations stay. **Do not revert Phase 1** — it would re-introduce the silent-plaintext decrypt fallback.
- **C. Migration drop**: `DROP TABLE audit_log` and/or `ALTER TABLE user_risk_profiles DROP COLUMN ...`. Almost never needed. **Must pair with code revert** or `loadRiskLimits()` crashes. For audit_log: `TRUNCATE` is the clean reset (next write becomes genesis). Do NOT `DELETE WHERE id < N` — breaks the chain forever.

See `public/docs/engine-ruleset.html` (sections 16-20) and `CLAUDE.md` § Live Trading for full detail. The HTML is served at `/docs/engine-ruleset.html` on any deployment.

## AI Provider & System Configuration

**Every AI flow in Sentinel runs on Groq** (`llama-3.3-70b-versatile`). That includes: Insights page, Quick Insight widget, hybrid AI scoring layer (`hybrid/ai-scoring-layer.ts`), sentiment layer, filings chat, daily market digest cron, AI chat panel, and the Recent Trades **AI ✨** trade-summary button. The `@anthropic-ai/sdk` dependency was removed in commit `0b2ef7e` after the lone Anthropic callsite (`summarize-trade`) was migrated. `CLAUDE_CONFIG` in `src/lib/config.ts` is still the source of truth for `.model` + `.maxTokens` constants but no longer reads `.apiKey` directly — all key resolution goes through `getLlmApiKey()` in `src/lib/system-config.ts`.

**System Configuration table** (`system_config`, migration `0030`): encrypted server-wide secrets that admins can rotate from `/dashboard/admin/system-config` without touching the droplet. Schema is just `(key TEXT PRIMARY KEY, value_encrypted TEXT, updated_by UUID, updated_at TIMESTAMPTZ)`. Values are AES-256-GCM ciphertext via `src/lib/crypto.ts` (no plaintext fallback). Allow-list of known keys is enforced in code: `GROQ_API_KEY`, `FINNHUB_API_KEY`, `ANTHROPIC_API_KEY` — admins can't silently overwrite arbitrary env vars from the UI.

**Resolution order** at runtime: 60s in-memory cache → DB row (decrypted) → `process.env[<key>]` fallback → null. The env fallback exists so the app boots cleanly on fresh installs before the admin has populated the DB.

**Admin UI** (`/dashboard/admin/system-config`):
- Lists each known key with a last-4-char mask, source badge (`DB` / `ENV fallback` / `Not set`), updated-by and updated-at metadata
- **[Test]** button hits the live provider with a 1-token ping using the candidate key (Groq `/chat/completions`, Finnhub `/quote?symbol=AAPL`, Anthropic `/messages`). Value is not persisted
- **[Replace]** modal accepts a paste, runs Test-before-save, then Save (encrypts + upserts + writes hash-chained `SYSTEM_CONFIG_UPDATED` audit row)
- Plaintext values are **never** returned by any API or displayed in the UI after save

**Caveats:**
- The Finnhub client (`src/lib/finnhub.ts`) is a singleton that reads its API key field once at process boot. Rotating `FINNHUB_API_KEY` via the admin UI requires an app restart for the trading engine + per-symbol routes (news, sentiment, recommendations, fundamentals) to pick up the new value. The LLM path (`getLlmApiKey()`) is fully async and refreshes within the 60s cache window.
- API key store is **server-wide** — one Groq key serves every user. Per-user overrides are documented as a deferred design in `future-ideas.md`.

## Marathon Updates (2026-05-12, Phases 1–4)

Post-launch hardening pass. Items here augment the relevant sections above; cross-referencing CLAUDE.md's 6-phase retrospective for commit SHAs.

### Phase 1 — Money bugs from UI-lie audit

- **`canPlaceBuyOrder()` is async + takes a fresh `account` snapshot.** Refreshes the wash-sale symbol set (`maybeRefreshWashSaleSet()`) before the wash-sale check; re-runs `evaluatePdtState(engine, account)` before the PDT check. A 2nd day-trade in a 15-min window or a same-scan losing-close-then-re-entry now correctly evaluates against live state instead of scan-boundary state.
- **Gate ordering inside `canPlaceBuyOrder()`:** wash-sale → PDT → sector exposure → earnings blackout → notional → rate-limit. Cheapest checks first; the first reason found is what gets logged.
- **`bootEquity` re-snapshots at every new trading day** across all 3 scan paths (intraday, tactical, main). The 50% equity-collapse tripwire stays calibrated as the account grows organically.
- **`tripSafeguardHalt()` writes `halted=true` to `trader_daily_pnl` immediately** (fire-and-forget) so the dashboard reflects halts on the next fetch instead of waiting for the next scan boundary.
- **Dashboard `todayPnl` response carries `source` + `staleSeconds`** (`"broker_intraday" | "broker_total" | "db_snapshot"`) so the UI can render staleness honestly instead of silently mixing broker intraday with DB snapshot.

### Phase 2 — Frozen-value cleanup

- **`syncPositionMapFromBroker()` resets `pos.peakPrice = currentPrice`** when broker qty drops > 5% (partial close — trail recalibrates from post-close size).
- **Re-resolves `pos.trailingStopPct` and `pos.takeProfit`** from the current strategy on every sync, so Strategies-page edits propagate to existing positions.
- **`syncBrokerStops()` writes `pos.stopLoss = targetStop`** after every successful broker place/replace. Dashboard route reads `Math.max(broker, tracked.stopLoss)` defensively. Closes the UI-lie where the Stop column displayed entry-time disaster value while the broker stop was correctly ratcheting up.

### Phase 3 — Cache invalidation

- **`FILTER_CACHE_TTL_MS = 6h`** added on top of the existing day-string check for earnings + sentiment caches. Server-boot-at-3am-ET no longer means 20+ hours of stale data.
- **Screener cache adds `scanStartedAt: Date | null`.** `/api/screener` exposes both `scannedAt` (completed) and `scanStartedAt` (in-flight). Same field added to `EngineState` and surfaced through `peekEngineStatus()`.

### Phase 4 — Engine intelligence

Migration `0029_engine_intelligence.sql` added three columns to `user_risk_profiles`. `RiskLimits` expanded with `maxSectorExposurePct` / `adaptiveModeEnabled` / `earningsBlackoutDays`.

- **Sector exposure cap.** `canPlaceBuyOrder` takes optional `sectorExposureContext` (live position market values keyed by symbol) and refuses BUYs that would push a sector over `cap × equity`. New `buildSectorExposureContext()` helper. `TrackedPosition` now carries `currentPrice` + `marketValue` synced from broker so the cap check is in-memory.
- **Earnings blackout.** Calls existing `isInEarningsBlackout()` when `earningsBlackoutDays` is set on the risk profile.
- **P&L heatmap widget.** New `pnl-heatmap-widget` registered. Reads `/api/performance/attribution`. Top-5 symbols by realized $ with proportional bars.
- **Deferred:** engine dry-run mode. (Adaptive mode auto-switching shipped in Phase 8 — see below.)

## Phase 8 — Adaptive engine mode

`EngineMode` includes `"adaptive"`. When a user selects adaptive, the engine reads market regime at each scan boundary and runs as one of `conservative / moderate / optimized / aggressive` underneath. The user-selected mode stays `"adaptive"`; strategy decisions go through `getActiveMode(engine)` which returns the effective base mode. (`tactical` is excluded from adaptive's targets — its all-in/all-out philosophy contradicts a regime classifier that would switch off it.)

**Classifier**: `src/lib/market-regime.ts` — pure function, input `{ vix, spyPrice, spyMA50, spyMA200, breadthScore? }`, output `{ regime, recommendedMode, reasons }`.

**Regime rules (v1):**
- `VIX > 28` OR `SPY < SMA50` → risk_off → conservative
- `18 < VIX <= 28` AND `SPY >= SMA50` → neutral → moderate
- `VIX <= 18` AND `SPY > SMA50` → risk_on → optimized
- `VIX <= 14` AND `SPY > SMA200` AND breadth > 75 (live only) → strong risk_on → aggressive

**Never auto-selected:** `tactical` (all-in/all-out contradicts a regime classifier that would switch off it), `tactical-smart` (already adaptive), `adaptive` itself.

**Engine wiring:** `refreshAdaptiveMode(engine)` runs at the top of each scan path (main, tactical-smart). Fetches ^VIX + SPY bars via the existing market-data provider, computes SPY SMA50/200, calls `detectMarketRegime`, sets `engine.effectiveMode` + `engine.adaptiveRegime`. Emits `ENGINE_MODE_SWITCHED` audit row only when `effectiveMode` actually changes scan-to-scan.

**Backtester:** `runBacktest(symbol, bars, ..., mode?, marketContext?)` accepts optional `mode` + `marketContext: { spyBars, vixBars }`. When `mode === "adaptive"` AND marketContext provided, the backtester re-resolves the effective config per bar (looks up SPY/VIX for that date, runs the classifier, swaps `BacktestConfig`). Returns `modeTimeline: { date, mode }[]` so the UI can visualize regime swings.

**Mode-compare page** at `/dashboard/backtest/mode-compare?symbol=AAPL`: runs the 3 user-selectable comparable modes (optimized / tactical / adaptive; `tactical-smart` excluded as its own active-management logic doesn't translate to backtesting) in parallel via `Promise.allSettled`. Returns stats + equity curves + adaptive's modeTimeline.

**Trader page status banner** shows two lines when running adaptive:
1. `Running (adaptive) · PAPER · 14 scans · 3 positions`
2. `Adaptive — currently optimized · VIX 18.2 · SPY +1.2% vs SMA50 · risk_on`

**Failure handling:** if VIX/SPY fetch fails, engine keeps the previous `effectiveMode` (does NOT halt — adaptive is a meta-decision, not a safety check). Logs a warning.

**Live vs backtest difference:** live mode uses **VIX + SPY only** — `refreshAdaptiveMode()` does NOT fetch breadth (full breadth scan = 50 stocks × N days, kept as a v2 enhancement; the cost would land on every scan tick). The strong-risk-on → `aggressive` bump in the classifier **requires** a breadth score, so in practice live adaptive can resolve only to `conservative`, `moderate`, or `optimized`. Backtest replays VIX + SPY only too. Defensible simplification — if you specifically want `aggressive` sizing in a strong bull, pick it directly instead of relying on adaptive.

See `public/docs/engine-ruleset.html` (web view of this doc, served at `/docs/engine-ruleset.html` on any deployment) for the same content in HTML form. Both files are intentionally kept in sync — edit one, mirror to the other.

## Reliability fixes (2026-05-13)

### Scan re-entrancy guard

The scan scheduler previously used `setInterval(() => scanFn().catch())` with no re-entrancy guard. When a scan took longer than the tick interval (slow broker response, large universe), the next tick fired while the previous scan was still in flight. Both concurrent scans called `client.getOrders()` independently — and because Alpaca's orders endpoint has hundreds-of-ms eventual consistency, the second scan's `pendingBuySymbols` frequently missed the first scan's order. Result: both scans passed the duplicate-buy guard and placed identical limit orders sub-second apart. Reported as "two SNDK buys at the same price/qty/age."

Fix: closure-local `scanInFlight` flag flipped before `scanFn()` and cleared in `.finally()`. Belt: 10-minute stale-flag watchdog overrides the flag if it somehow stayed set (process crash mid-promise) so a wedged engine self-recovers within two intraday ticks. Same guard applied to the 1-minute exit-check interval.

### getOrders failure now aborts the scan

Previously a silent `try { ... } catch {}` swallowed `getOrders()` errors. The scan continued with an empty `pendingBuySymbols` set — going blind on duplicate-order detection. Now all three BUY paths (`runScan`, `runTacticalScan`, `runTacticalSmartScan`) log a warning, push a user-visible error, and abort the BUY portion of the scan when getOrders fails. Exits + position-map sync already happened before that point, so abort is safe for stop-loss management.

### Journal v2 hook in reconciler

When `reconcilePendingTrades` transitions a row from PENDING to FILLED, it now also calls `createAutoJournalStub()` (fire-and-forget, never throws). Inserts a journal entry pre-filled with the trade mechanics (symbol, action, fill price, P&L, signal) plus leading questions ("Why am I taking this trade?" for entries, "What's the lesson?" for exits). Idempotent via the `journal_auto_trade_uniq` partial unique index (migration 0032). Blank-canvas friction removed for journaling.

**Last revised:** 2026-05-13 (Journal v2 phases 1-6, scan re-entrancy guard, getOrders abort, CSRF audit fixes, themes 5-up, resizable Analysis layout).
