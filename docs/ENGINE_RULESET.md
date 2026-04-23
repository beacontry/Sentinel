# Sentinel Trading Engine — Complete Ruleset

## Overview

The trading engine scans the S&P 500, generates signals using technical analysis, applies safety filters, and executes trades through Alpaca. All rules are enforced programmatically — no manual intervention needed.

## Engine Modes

### Signal-Based Modes (scan for individual stock signals)

| Mode | Stop Loss | Take Profit | Trailing Stop | Hold Period | Position Size | Max Positions |
|------|-----------|-------------|---------------|-------------|---------------|---------------|
| Conservative | 1.5% | 2% | 1% | 30 bars | From risk settings | From risk settings |
| Moderate | 2% | 3% | 1.5% | 20 bars | From risk settings | From risk settings |
| **Optimized** | GA-tuned | GA-tuned | GA-tuned | GA-tuned | From risk settings | From risk settings |
| Aggressive | 3% | 5% | 2.5% | 15 bars | From risk settings | From risk settings |
| Intraday | 1.5% | 2.5% | 1% | 12 bars (1hr) | From risk settings | From risk settings |

### Tactical Modes (market-level timing)

| Mode | Entry Logic | Exit Logic | Stock Selection |
|------|------------|------------|-----------------|
| **Tactical** | SPY > 50-day SMA | SPY < 20-day SMA for 3 days | Equal-weight all stocks |
| **Tactical Smart** | SPY > 50-day SMA | SPY < 20-day SMA for 3 days | Momentum + signal + inverse volatility scored |

---

## Signal Generation

### Unified Signal Pipeline

All components use the same signal function — `analyzeBars()` from `src/lib/indicators/analyzer.ts`. The optimizer backtests against this function, the engine calls it live, and the screener uses it for scanning. There is no separate signal evaluator.

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

1. **Fixed stop loss** — price drops below entry × (1 - stopLossPct)
2. **Dynamic trailing stop** — price drops below peak × (1 - dynTrailPct)
3. **Take profit** — price exceeds entry × (1 + takeProfitPct)
4. **Sell signal** — technical analysis generates SELL/STRONG_SELL
5. **Hold period expired** — held longer than holdPeriod bars

### Dynamic Trailing Stop (Exponential Decay)

```
trail = 2% + (baseTrail - 2%) × e^(-3 × profitPct)
```

| Profit | Trailing Stop | Locked-in Minimum |
|--------|--------------|-------------------|
| 0% | 12.6% (base) | Could go negative |
| 5% | 10.3% | ~0% |
| 10% | 8.6% | ~1.4% |
| 20% | 5.5% | ~14.5% |
| 30% | 3.7% | ~26.3% |
| 50% | 2.4% | ~47.6% |

Floor: 2% minimum trailing stop regardless of profit level.

---

## Pre-Buy Safety Filters

Every buy signal passes through these gates before an order is placed:

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

---

## Order Execution

### Entry Orders
- **Type:** Limit order (0.1% above current price)
- **Time in force:** Day (expires at market close)
- **Stop price:** Included as bracket order on Alpaca

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

**While engine is running (disaster stops):**
- Wide 18% GTC stop orders on Alpaca for every position
- Only fire if the server is down for hours — engine manages tighter exits dynamically
- Placed on engine start and after position sync on auto-restart

**When engine is stopped (safety stops):**
- Tighter strategy-level GTC stops (~8.5% from optimizer) placed on Alpaca
- More protective since the engine won't be managing exits
- Placed automatically when engine is stopped or halted

**Transition:**
- **On engine start:** Cancels old stops → places 18% disaster stops
- **On engine stop:** Cancels disaster stops → places ~8.5% safety stops

### Auto-Restart After Deploy
- On first dashboard page load after container restart:
  - Checks Alpaca for open positions
  - If positions exist → auto-starts engine in last used mode (from DB)
  - Syncs broker positions into in-memory map so the engine immediately resumes dynamic management (trailing stops, exits, etc.)
  - Fires once per container lifecycle

### Mode Persistence
- Current engine mode saved to `traderStatus.mode` on every heartbeat
- Format: `paper:optimized`, `paper:tactical`, etc.
- Auto-restart reads last mode from DB
- Valid modes for auto-restart: conservative, moderate, optimized, aggressive, intraday, tactical, tactical-smart

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
- Both Tactical and Tactical Smart modes call `upsertDailyPnl` on each scan cycle
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

**Swaps (sell weak → buy strong):**
- Scans all held positions for SELL/STRONG_SELL signals
- Scans universe + external screener for STRONG_BUY candidates not already held
- Sells weak positions at market, buys replacement at limit (0.1% above current)
- Logged as `tactical_smart_swap_sell` / `tactical_smart_swap_buy`

**Additions (deploy unused cash):**
- Remaining STRONG_BUY candidates can be added if cash is available
- Respects 1.5× maxPositions hard cap (same as STRONG_BUY overflow)
- Respects max exposure limit
- Logged as `tactical_smart_add`

**Signal logging:**
- Top 5 STRONG_BUY candidates are logged to signals table for visibility even if not acted on

### Exit
- Same as Tactical (full exit on SPY weakness)

---

## Intraday Mode Rules

### Scan Interval
- Signal scan: every 5 minutes
- Exit check: every 1 minute (live quotes)

### Bar Resolution
- 5-minute bars (fetches 5 days of 5-min data)

### Flatten Time
- **3:00 PM ET:** Close ALL positions at market
- No new positions opened after 3:00 PM

---

## Screener → Engine Signal Flow

The screener (`src/lib/screener.ts`) is a shared, user-independent market scanner that feeds signals to the trading engine.

### How It Works

1. **Daily scan** at market open: fetches 90-day bars for 500+ popular stocks, runs `analyzeHybrid()` with default signal params
2. **Intraday scan** every 5 minutes: fetches 5-min bars (2 days), same pipeline
3. **Push to engine:** actionable signals (BUY/STRONG_BUY with confidence ≥ 0.6) auto-pushed via `pushExternalSignal()`
4. **Dedup:** same symbol+signal ignored within 30 minutes
5. **Expiry:** external signals expire after 30 minutes

### How Each Mode Consumes Screener Signals

| Mode | Consumes? | How |
|------|-----------|-----|
| Conservative | Yes | External signal symbols added to scan universe; if signal matches, can trigger entry |
| Moderate | Yes | Same |
| Optimized | Yes | Same |
| Aggressive | Yes | Same |
| Intraday | Yes | Same (on 5-min bars) |
| Tactical | **No** | Ignores screener — pure SPY timing |
| Tactical Smart | **Yes** | Boosts candidate scores during stock selection (STRONG_BUY +3pts, BUY +1pt) |

### Key Properties

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
| Conservative | Defaults | Hardcoded preset | Fixed % | From optimizer | Yes |
| Moderate | Defaults | Hardcoded preset | Fixed % | From optimizer | Yes |
| **Optimized** | **GA-tuned** | **GA-tuned** | **ATR × mult** | **GA-tuned** | Yes |
| Aggressive | Defaults | Hardcoded preset | Fixed % | From optimizer | Yes |
| Intraday | Defaults | Hardcoded intraday | Fixed % | From optimizer | Yes |
| Tactical | N/A (SPY only) | GA or swing preset | Fixed % | N/A | No |
| Tactical Smart | Defaults | GA-tuned | Fixed % | N/A | **Yes (boost)** |

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

Updated on every scan cycle — changes take effect within 15 minutes.
