# Sentinel

Trading intelligence platform that combines scanning, analysis, automated execution, and portfolio management into one workspace.

**Live**: [sentinel.guardcybersolutionsllc.com](https://sentinel.guardcybersolutionsllc.com)

## Overview

Sentinel is a full-stack trading platform that scans the market, generates technical signals, optimizes strategies using genetic algorithms, and executes trades through Alpaca. It replaces the need for separate tools by integrating everything from screener to execution in a single application.

### Core Loop

```
Screener → Signals → Strategy Selection → Execution → Position Management → P&L Tracking
```

1. **Screener** scans stocks for setups using technical indicators
2. **Analysis** provides chart structure, signal conviction, and market context
3. **Optimizer** runs genetic algorithms against 5 years of S&P 500 data to find optimal strategy parameters
4. **Trading Engine** executes buy/sell orders through Alpaca based on signals and strategy rules
5. **Trader Dashboard** monitors positions, P&L, and engine status in real-time

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
│   │   ├── optimize/           # GA optimizer start/status/results
│   │   ├── broker/             # Alpaca/IBKR/Tradier connections
│   │   ├── screener/           # Market scanner
│   │   ├── analyze/[symbol]/   # Technical analysis
│   │   ├── backtest/[symbol]/  # Strategy backtesting
│   │   └── ...
│   ├── dashboard/              # 25+ pages
│   │   ├── trader/             # Live trading with engine controls
│   │   ├── optimizer/          # GA optimization runs
│   │   ├── strategies/         # Strategy assignments per symbol
│   │   ├── backtest/           # Strategy backtesting lab
│   │   ├── analysis/           # Technical analysis cockpit
│   │   ├── screener/           # Market scanner
│   │   ├── calendar/           # Economic calendar
│   │   └── ...
│   ├── login/                  # Authentication
│   └── register/
├── components/
│   ├── ui/                     # Design system (Button, Card, Badge, etc.)
│   ├── dashboard/              # Page-specific components
│   └── layout/                 # Shell, nav, sub-nav
├── lib/
│   ├── trading-engine.ts       # Automated trading engine (1300+ LOC)
│   ├── optimizer.ts            # Genetic algorithm optimizer
│   ├── brokers.ts              # Alpaca/IBKR/Tradier broker clients
│   ├── backtester.ts           # Strategy backtesting engine
│   ├── market-data.ts          # Yahoo/Finnhub data providers
│   ├── screener.ts             # Market scanner with auto-scheduling
│   ├── indicators/             # 10+ technical indicators (SMA, EMA, RSI, MACD, etc.)
│   ├── strategy-presets.ts     # Preset strategies (Conservative → Optimized)
│   ├── sp500.ts                # S&P 500 ticker universe
│   ├── db/                     # Drizzle schema + connection
│   └── ...
└── types/                      # TypeScript type definitions
```

## Trading Engine

The automated trading engine (`src/lib/trading-engine.ts`) scans the market and executes trades through your connected broker.

### 5 Engine Modes

| Mode | Stop Loss | Take Profit | Hold Period | Bars | Scan Interval |
|------|-----------|-------------|-------------|------|---------------|
| Conservative | 1.5% | 2% | 30 bars | Daily | 15 min |
| Moderate | 2% | 3% | 20 bars | Daily | 15 min |
| **Optimized** | 12% | 28% | 43 bars | Daily | 15 min |
| Aggressive | 3% | 5% | 15 bars | Daily | 15 min |
| Intraday | 1.5% | 2.5% | 1 hour | 5-min | 5 min + 1-min exits |

The **Optimized** preset is tuned by the genetic algorithm across 5 years of S&P 500 data (50/50 train/test validation). It achieved 59.9% train / 35.6% test return with a 1.07 Sharpe ratio.

### Signal Flow

```
Top 50 S&P 500 (automatic scan)
         +
Screener results (any stock)
         ↓
   Technical Analysis
   (EMA, RSI, MACD, SMA, VWAP, Bollinger, Volume)
         ↓
   BUY / SELL signal?
         ↓
   Safety Checks:
   ├── Market open? (9:30-4:00 ET, Mon-Fri)
   ├── SPY above SMA(20)? (market health)
   ├── Daily loss limit OK? (2% of equity)
   ├── Max positions OK? (from risk settings)
   ├── Max exposure OK? (from risk settings)
   └── Signal cooldown clear? (2.5 hrs per symbol)
         ↓
   Place limit order on Alpaca
   (with bracket stop-loss)
```

### Safety Features

- **Paper mode only** — engine refuses to start with live broker connections
- **Broker-side stop orders** — placed automatically when engine stops/crashes
- **Auto-restart** — detects open positions after deploy and resumes with last mode
- **Daily loss auto-halt** — stops all trading if losses exceed configured % of equity
- **SPY trend filter** — blocks all buys when SPY is below its 20-day SMA
- **Signal cooldown** — prevents re-buying same symbol within 2.5 hours
- **Max exposure cap** — total portfolio exposure limit from risk settings
- **Intraday flatten** — closes all positions at 3:00 PM ET in intraday mode
- **Risk settings from DB** — all limits configurable from the Trader page UI

## Strategy Optimizer

The genetic algorithm optimizer (`src/lib/optimizer.ts`) finds optimal strategy parameters by running portfolio simulations across 50 liquid S&P 500 stocks over 5 years of daily data.

### How It Works

1. **Data fetch** — downloads 5Y daily bars for 50 stocks (cached 24h)
2. **Portfolio simulation** — holds multiple stocks simultaneously (3-20 positions), evaluates signals using tunable RSI/EMA thresholds
3. **Genetic algorithm** — population of 30-40 strategies, evolves over 25-40 generations using tournament selection, crossover, and mutation
4. **Walk-forward validation** — trains on first half, validates on second half to prevent overfitting
5. **Fitness function** — maximizes portfolio excess return over buy-and-hold

### Optimizable Parameters

- Stop loss, take profit, trailing stop percentages
- Hold period (bars)
- Position size (% of equity per position)
- Max concurrent positions
- RSI oversold/overbought thresholds
- EMA fast/slow crossover periods

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
| **Screener** | Screener | Scan market for setups |
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
- **Yahoo Finance primary** — free, no API key, handles 5Y daily data in single requests. Finnhub as fallback.
- **In-memory engine state** — positions tracked in `globalThis` for speed, with DB persistence for restarts and broker-side safety stops for crash protection.
- **Portfolio-level optimization** — optimizer simulates holding multiple stocks simultaneously (not individual backtests) to match real trading conditions.
- **Dynamic risk controls** — all limits read from DB on every scan cycle so changes from the UI take effect immediately.
