# Sentinel

Trading intelligence platform that combines scanning, analysis, automated execution, and portfolio management into one workspace.

**Live**: [sentinel.guardcybersolutionsllc.com](https://sentinel.guardcybersolutionsllc.com)

## Overview

Sentinel scans the entire S&P 500, generates technical signals, optimizes strategies using genetic algorithms, and executes trades through Alpaca. Everything from screener to execution runs in a single application.

### Core Loop

```
Optimizer → finds best strategy params
     ↓
Engine → scans S&P 500, generates signals, trades via Alpaca
     ↓
Screener → discovers opportunities beyond top 50, feeds to engine
     ↓
Dashboard → monitors positions, P&L, risk in real-time
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15.3 (App Router) |
| Frontend | React 19, Tailwind CSS 4, Lucide Icons |
| Database | PostgreSQL + Drizzle ORM |
| Charting | Lightweight Charts (TradingView) |
| Broker | Alpaca (paper + live), IBKR, Tradier |
| Market Data | Yahoo Finance (primary), Finnhub (fallback) |
| AI | Anthropic Claude SDK |
| Deployment | Docker/Podman, GitHub Actions CI/CD |

## Project Structure

```
src/
├── app/
│   ├── api/                    # 60+ API routes
│   │   ├── trader/             # Engine control, dashboard, signals
│   │   ├── optimize/           # GA optimizer, compare modes, save preset
│   │   ├── broker/             # Alpaca/IBKR/Tradier connections
│   │   ├── screener/           # Market scanner
│   │   ├── analyze/[symbol]/   # Technical analysis
│   │   ├── backtest/[symbol]/  # Strategy backtesting
│   │   └── ...
│   ├── dashboard/
│   │   ├── trader/             # Live trading with engine controls
│   │   ├── optimizer/          # GA runs, mode comparison, save preset
│   │   ├── strategies/         # Strategy assignments per symbol
│   │   ├── backtest/           # Strategy backtesting lab
│   │   ├── analysis/           # Technical analysis cockpit
│   │   ├── screener/           # Market scanner
│   │   ├── calendar/           # Economic calendar
│   │   └── ...
│   ├── login/
│   └── register/
├── components/
│   ├── ui/                     # Design system (Button, Card, Badge, etc.)
│   ├── dashboard/              # Page-specific components
│   └── layout/                 # Shell, nav, sub-nav
├── lib/
│   ├── trading-engine.ts       # Automated trading engine
│   ├── signal-eval.ts          # Shared signal evaluator (optimizer + mode comparison)
│   ├── optimizer.ts            # Genetic algorithm optimizer
│   ├── brokers.ts              # Alpaca/IBKR/Tradier broker clients
│   ├── backtester.ts           # Strategy backtesting engine
│   ├── market-data.ts          # Yahoo/Finnhub data providers
│   ├── screener.ts             # Market scanner with auto-scheduling
│   ├── trader-client.ts        # Screener → Engine signal bridge
│   ├── indicators/             # 10+ technical indicators
│   ├── strategy-presets.ts     # 9 preset strategies
│   ├── sp500.ts                # S&P 500 universe (auto-updates from Wikipedia)
│   ├── db/                     # Drizzle schema + connection
│   └── ...
└── types/
```

## Trading Engine

The automated trading engine (`src/lib/trading-engine.ts`) scans the full S&P 500, generates signals, and executes trades through Alpaca.

### 7 Engine Modes

| Mode | Strategy | Bars | Scan Interval |
|------|----------|------|---------------|
| Conservative | 1.5% SL, 2% TP, 30-bar hold | Daily | 15 min |
| Moderate | 2% SL, 3% TP, 20-bar hold | Daily | 15 min |
| **Optimized** | 9% SL, 40% TP, 33-bar hold (GA-tuned) | Daily | 15 min |
| Aggressive | 3% SL, 5% TP, 15-bar hold | Daily | 15 min |
| Intraday | 1.5% SL, 2.5% TP, flatten 3 PM ET | 5-min | 5 min + 1-min exits |
| **Tactical** | Always invested, exit on SPY weakness | Daily | 15 min |
| **Tactical Smart** | Momentum + signal scored entries, SPY exit | Daily | 15 min |

### Mode Comparison (5-year backtest, $10,000)

| Mode | Return | Final Value | Max DD | Sharpe |
|------|--------|-------------|--------|--------|
| SPY Buy & Hold | +71.9% | $17,191 | -25.4% | — |
| **Tactical** | **+90.1%** | **$19,007** | -18.8% | 1.27 |
| Tactical Smart | +69.2% | $16,915 | -12.0% | 1.08 |
| Optimized (GA) | +52.7% | $15,270 | -10.1% | 1.46 |

### Signal Flow

```
Full S&P 500 (~495 stocks, auto-updated from Wikipedia)
         +
Screener signals (any stock from market scan)
         ↓
   Technical Analysis (EMA, RSI, MACD, SMA, VWAP, Bollinger, Volume)
         ↓
   BUY / SELL signal?
         ↓
   Safety Checks:
   ├── Market open? (9:30-4:00 ET, Mon-Fri)
   ├── SPY above SMA(20)? (market health filter)
   ├── Daily loss limit OK? (from risk overrides)
   ├── Max positions OK? (BUY respects cap; STRONG_BUY can overflow by 50%)
   ├── Max exposure OK? (from risk overrides)
   └── Signal cooldown clear? (2.5 hrs per symbol)
         ↓
   Place limit order on Alpaca (with bracket stop-loss)
```

Signal evaluation uses a shared tunable evaluator (`src/lib/signal-eval.ts`) across the entire system. The live engine, optimizer, and mode comparison all use `evaluateBarSignal` with optimizer-tuned EMA periods and RSI thresholds. The engine loads tuned params from the latest optimizer run on each scan cycle, falling back to defaults if unavailable. `analyzeBars()` is still called for price/volume/indicator data used in logging and display.

### Dynamic Trailing Stops

Trailing stop tightens automatically as profit grows using exponential decay:

```
trail = 2% + (base - 2%) × e^(-3 × profitPct)

 0% profit  → 12% trail (base)
10% profit  →  8.6% trail
20% profit  →  5.5% trail
30% profit  →  3.7% trail (locks in ~26%)
50% profit  →  2.4% trail (locks in ~48%)
```

### Safety Features

- **Paper mode only** — engine refuses to start with live broker connections
- **Broker-side stop orders** — placed on Alpaca when engine stops/crashes
- **Auto-restart with position sync** — detects open positions after deploy, syncs broker positions into memory, resumes with last mode (all 7 modes supported)
- **Daily loss auto-halt** — stops trading if losses exceed configured % of equity
- **SPY trend filter** — blocks all buys when SPY below 20-day SMA
- **Signal cooldown** — 2.5 hours between same-symbol buys
- **STRONG_BUY overflow** — BUY signals respect maxPositions; STRONG_BUY can exceed by up to 50%
- **Max exposure cap** — from risk overrides in DB
- **Limit orders** — no market orders for entries (controlled fills)
- **Intraday flatten** — closes all positions at 3:00 PM ET
- **Risk overrides from DB** — all fields optional; empty = engine defaults. Only user-set fields impose limits
- **Dashboard always shows broker data** — account balance and positions fetched live from Alpaca regardless of engine state

## Strategy Optimizer

The genetic algorithm optimizer (`src/lib/optimizer.ts`) finds optimal strategy parameters through portfolio simulation.

### How It Works

1. **Data fetch** — downloads 5Y daily bars (incremental cache — only fetches new days after first run)
2. **Portfolio simulation** — holds multiple stocks simultaneously, evaluates signals with tunable thresholds
3. **Genetic algorithm** — tournament selection, crossover, mutation across configurable population/generations
4. **Walk-forward validation** — trains on first half, tests on second half to prevent overfitting
5. **Fitness function** — maximizes portfolio excess return over buy-and-hold

### Configuration

| Setting | Range | Description |
|---------|-------|-------------|
| Population | 10-100 | Strategies competing per generation |
| Generations | 5-100 | Evolution rounds |
| Train/Test Split | 40-80% | Walk-forward validation split |
| Universe | Top 50 / Full S&P 500 | Stocks to simulate against |

### Optimizable Parameters

- Stop loss, take profit, trailing stop percentages
- Hold period (bars)
- Position size (% of equity per position)
- Max concurrent positions
- RSI oversold/overbought thresholds
- EMA fast/slow crossover periods

### Mode Comparison

The optimizer page includes a **Compare Modes** feature that backtests all 7 engine modes + SPY buy-and-hold against 5 years of real data. Shows return, final value, max drawdown, Sharpe ratio, trades, and time in market.

Mode Comparison loads all 11 optimizer parameters from the latest completed run. The Optimized (GA) row uses the shared signal evaluator (`src/lib/signal-eval.ts`) with the full optimizer param set. Other mode rows use `analyzeBars()` from the standard indicator module.

**Save as Optimized** button on any completed run makes it the active preset. The engine picks up new params within 5 minutes. Compare Modes auto-refreshes when saving.

## S&P 500 Universe

The stock universe auto-updates daily from Wikipedia's S&P 500 constituents table (`src/lib/sp500.ts`). Falls back to a hardcoded list if the fetch fails. No deploy needed when S&P 500 rebalances quarterly.

## Screener → Engine Integration

The Screener feeds signals directly into the trading engine. When the Screener finds a BUY/STRONG_BUY signal on any stock (including outside the S&P 500), it pushes it to the engine's queue. The engine processes these alongside its regular scan, allowing it to trade opportunities from the entire market.

Concurrent calls to `scanAllSymbols` share the in-flight scan promise — clicking "Scan Market" while the scheduler is running waits for that scan rather than returning empty results. The route exposes the live `scanning` flag so the UI can show "Scan in progress" instead of misreporting "No matches found".

## Backtest Lab

`/dashboard/backtest` runs strategies against historical bars from `/api/backtest/[symbol]`.

- **Strategy Preset** dropdown is restricted to the 7 engine-runnable modes plus `Custom` and `Auto (ATR-tuned)`. Selecting a preset syncs Hold Period, Stop Loss, Trail Stop, and Take Profit; editing any of those fields flips the preset to `Custom`.
- **Window** toggle: "Last N days" (capped at 365) or "Date range" with start/end pickers (caps at ~25 years, 60-day indicator warmup pad applied internally). Date-range mode is daily-bars only — Yahoo only retains ~60 days of intraday data.
- Historical fetches (endDate >24h in the past) bypass the disk cache so they don't pollute live data.

## Tax Center

`/dashboard/tax-center` is the unified tax view. `/api/tax/report` and `/api/tax/harvesting` merge:
- **Realized gains** from manual `portfolioTrades` and engine `traderTrades` (status=FILLED, filtered by `fillTime` so cross-year fills are taxed correctly).
- **Harvesting candidates** from manual `portfolioPositions` and live broker positions (`getBrokerPositionCache(userId)` — broker is source of truth).

The separate `/dashboard/tax` page generates IRS Form 8949 from engine fills only.

## Broker Integration

Three brokers supported via unified `BrokerClient` interface:

| Broker | Type | Status |
|--------|------|--------|
| **Alpaca** | Cloud API, commission-free | Primary — fully integrated |
| IBKR | Local gateway (Client Portal API) | Supported — requires local gateway |
| Tradier | Cloud API | Supported |

All brokers support: `getAccount()`, `getPositions()`, `getOrders()`, `placeOrder()`, `cancelAllOrders()`

## Dashboard Pages

| Section | Pages | Purpose |
|---------|-------|---------|
| **Dashboard** | Home | Command center with watchlist, signals, P&L |
| **Analysis** | Analysis, Heatmap, Correlation, Relative Strength | Chart structure and market views |
| **Screener** | Screener | Scan market for setups, feeds signals to engine |
| **Trader** | Live Trader, Strategies, Backtest, Optimizer, Alerts, Calculator | Execution and strategy management |
| **Journal** | Journal, Performance, P&L Calendar, Tax Center | Trade review and tracking |
| **Research** | News, Articles, Filings, Insights, Education | Market research |
| **Macro** | Calendar, Currency, Policy | Economic events and FX |
| **Community** | Feed, Forum, Posts | Social trading |
| **Admin** | Admin, Settings | User management and configuration |

## Setup

### Prerequisites

- Node.js 22+
- PostgreSQL 15+
- Alpaca account (free paper trading at [alpaca.markets](https://alpaca.markets))

### Environment Variables

```bash
cp .env.example .env
```

Required:
```
DATABASE_URL=postgres://user:pass@localhost:5432/sentinel
JWT_SECRET=your-secret-here
```

Optional:
```
FINNHUB_API_KEY=           # Fallback market data
ANTHROPIC_API_KEY=         # AI chat analysis
NEXT_TELEMETRY_DISABLED=1
```

### Install & Run

```bash
npm install
npx drizzle-kit migrate    # Run database migrations
npm run dev                 # Start development server (localhost:3000)
```

### Production Deployment

CI/CD via GitHub Actions: push to `main` → build Docker image → push to GHCR → deploy to server.

```bash
# Manual deploy
ssh deploy@server
sudo -u sn-deploy -i bash -c '
  podman pull ghcr.io/ixiondt/sentinel:latest
  podman stop sentinel-app; podman rm sentinel-app
  podman run -d --name sentinel-app \
    --network=host --env-file /opt/apps/sentinel/.env \
    -e NODE_ENV=production -e PORT=3010 \
    --restart always -m 1g \
    ghcr.io/ixiondt/sentinel:latest
'
```

## Architecture Decisions

- **Embedded engine** — trading engine runs inside the Next.js process (no separate service needed). Yields event loop every 3 evaluations to keep HTTP responsive.
- **Simple beats clever** — Tactical mode (full in/full out based on SPY trend) outperforms all signal-based strategies. Equal-weight beats stock-picking for tactical allocation.
- **Smooth trailing stops** — exponential decay from base toward 2% floor. Locks in progressively more gain without sudden threshold jumps.
- **Incremental data caching** — first run downloads full 5Y, subsequent runs only fetch new days. Optimizer runs start in <1s after first run.
- **Dynamic everything** — strategy presets read from latest optimizer run in DB. Risk limits read from user profile. S&P 500 list auto-updates from Wikipedia. No hardcoded values that require deploys.
- **Safety-first** — paper mode only, broker-side stops on engine shutdown, auto-restart with position sync on deploy, SPY health filter, daily loss halt, STRONG_BUY overflow cap. Multiple layers of protection.
- **Risk overrides, not risk settings** — all risk profile fields are optional. Empty = engine decides using code defaults. Only user-set values impose limits, so the engine works sensibly out of the box.
- **Broker data always live** — dashboard account balance and positions always fetched from Alpaca regardless of engine state. Positions prefer live broker data over stale DB records.
- **Yahoo Finance primary** — free, no API key, handles 5Y daily data in single requests. Finnhub as fallback.
- **Portfolio-level optimization** — optimizer simulates holding multiple stocks simultaneously (not individual backtests) to match real trading conditions.
