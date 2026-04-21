# Sentinel Trading Engine — Complete Ruleset

## Overview

The trading engine scans the S&P 500, generates signals using technical analysis, applies safety filters, and executes trades through Alpaca. All rules are enforced programmatically — no manual intervention needed.

## Engine Modes

### Signal-Based Modes (scan for individual stock signals)

| Mode | Stop Loss | Take Profit | Trailing Stop | Hold Period | Position Size | Max Positions |
|------|-----------|-------------|---------------|-------------|---------------|---------------|
| Conservative | 1.5% | 2% | 1% | 30 bars | From risk settings | From risk settings |
| Moderate | 2% | 3% | 1.5% | 20 bars | From risk settings | From risk settings |
| **Optimized** | 9% | 40.2% | 11.7% | 33 bars | 20% | From risk settings |
| Aggressive | 3% | 5% | 2.5% | 15 bars | From risk settings | From risk settings |
| Intraday | 1.5% | 2.5% | 1% | 12 bars (1hr) | From risk settings | From risk settings |

### Tactical Modes (market-level timing)

| Mode | Entry Logic | Exit Logic | Stock Selection |
|------|------------|------------|-----------------|
| **Tactical** | SPY > 50-day SMA | SPY < 20-day SMA for 3 days | Equal-weight all stocks |
| **Tactical Smart** | SPY > 50-day SMA | SPY < 20-day SMA for 3 days | Momentum + signal + inverse volatility scored |

---

## Signal Generation

### Signal Evaluator Architecture

Two signal evaluation paths exist:

| Component | Signal Source | Used By |
|-----------|-------------|---------|
| **`src/lib/signal-eval.ts`** | Shared evaluator with tunable params (EMA fast/slow, RSI oversold/overbought) | Optimizer, Mode Comparison (Optimized/GA row), Live engine (signal decisions) |
| **`src/lib/indicators/analyzeBars()`** | Standard indicator module (price, volume, indicators for logging) | Live engine (data extraction), Mode Comparison (non-Optimized rows) |

The live engine uses the same tuned signal parameters as the optimizer. On each scan, it loads the latest optimizer params (EMA periods, RSI thresholds) and uses `evaluateBarSignal` for signal decisions, while still calling `analyzeBars` for price/volume/indicator data needed for logging and display. If no optimizer run exists, it falls back to `analyzeBars` defaults.

### Entry Signals (BUY / STRONG_BUY)

All conditions evaluated per stock at each scan interval:

**Indicators Used:**
- EMA crossover (fast/slow periods from optimizer: default 7/38)
- RSI (14-period, oversold/overbought thresholds from optimizer: default 29/71)
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
| 0% | 11.7% (base) | Could go negative |
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

### Broker-Side Safety Stops
- **On engine stop:** Places GTC stop-loss orders on Alpaca for all open positions
- **Stop price:** Entry price × (1 - stopLossPct) from strategy
- **On engine start:** Cancels all broker-side stop orders (engine takes over)

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

## Data Sources

| Source | Data | Used For | Caching |
|--------|------|----------|---------|
| **Yahoo Finance** | Daily/5-min bars, quotes | Signal generation, momentum | Incremental (only new days) |
| **Finnhub** | Earnings calendar | Earnings blackout filter | Daily |
| **Finnhub** | News sentiment | Sentiment gate | Daily |
| **Finnhub** | Fallback bars | Backup data source | Per request |
| **Wikipedia** | S&P 500 constituents | Universe auto-update | Daily |
| **Alpaca** | Account, positions, orders | Execution, P&L | Real-time |

## Optimizer → Engine Flow

```
Optimizer completes run → saves bestParams to optimization_runs table
                                    ↓
Engine reads latest completed run every 5 minutes (cached)
                                    ↓
Uses those params for Optimized + Tactical modes
                                    ↓
Per-symbol overrides from Strategies page take priority
```

### Mode Comparison Integration

The Mode Comparison feature loads all 11 optimizer parameters from the latest completed run (not just the 4 strategy params). For the Optimized (GA) row, it uses the shared signal evaluator (`signal-eval.ts`) with the full optimizer param set. All other mode rows use `analyzeBars()` from the standard indicator module.

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
