# 🔦 Beacontry

> Open-source trading intelligence platform. Scanning, analysis, automated
> execution, and portfolio management in one workspace — fully transparent,
> fully inspectable, fully yours.

**Live**: [beacontry.com](https://beacontry.com) · also reachable at the legacy alias [sentinel.guardcybersolutionsllc.com](https://sentinel.guardcybersolutionsllc.com)

**Docs**: [Features reference](https://beacontry.com/docs/sentinel-features.html) · [Engine ruleset](https://beacontry.com/docs/engine-ruleset.html)

## Overview

Beacontry scans the entire S&P 500, generates confidence-scored signals
from a hybrid pipeline (technical + sentiment + options flow + analyst +
AI scoring + Reddit chatter), optimizes strategies using genetic
algorithms, and executes trades through your broker. Everything from
screener to execution runs in one application — and every decision is
inspectable.

> **Internal naming note:** "Sentinel" remains the internal name for the
> trading-engine code module — type names, DB tables (`trader_*`), env
> vars, internal logs, etc. "Beacontry" is the public-facing brand the
> engine is shipped under. Both names refer to the same platform.

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
| AI | Groq (`llama-3.3-70b-versatile`) — Insights, Quick Insight, hybrid AI scoring, sentiment, filings chat, market digest, AI chat, Recent Trades AI summaries. Rotate via `/dashboard/admin/system-config` (encrypted at rest) |
| Deployment | Docker/Podman, GitHub Actions CI/CD |

## Project Structure

```
src/
├── app/
│   ├── api/                    # 90+ API routes
│   │   ├── trader/             # Engine control, dashboard, signals
│   │   ├── optimize/           # GA optimizer, compare modes, save preset
│   │   ├── broker/             # Alpaca/IBKR/Tradier connections (+ /[id]/activate switcher)
│   │   ├── screener/           # Market scanner
│   │   ├── analyze/[symbol]/   # Technical analysis
│   │   ├── backtest/[symbol]/  # Strategy backtesting (Sharpe + Sortino + Calmar + MAR)
│   │   ├── watchlists/         # Multi-watchlist CRUD + share tokens
│   │   ├── dashboard/layouts/  # Multi-layout CRUD with named layouts
│   │   ├── support/tickets/    # Customer support tickets + messages
│   │   ├── dm/threads/         # Private user-to-user DMs
│   │   ├── congress/           # Federal Periodic Transaction Reports
│   │   ├── transcripts/        # Earnings call metadata listing
│   │   ├── performance/attribution/  # Per-symbol realized P&L
│   │   ├── me/                 # Per-user prefs (terms, digest-email)
│   │   ├── public/watchlist/   # Public share-token reads (no auth)
│   │   └── ...
│   ├── dashboard/
│   │   ├── trader/             # Live trading with engine controls
│   │   ├── trade/[symbol]/     # Manual order ticket (engine-gated)
│   │   ├── analysis/           # Technical analysis cockpit + TradingView toggle
│   │   ├── watchlists/         # Multi-watchlist management with share buttons
│   │   ├── congress/           # Politician trade tracker
│   │   ├── messages/           # DM inbox + threads
│   │   ├── support/            # Customer support inbox + threads
│   │   ├── pnl-calendar/       # P&L heatmap with clickable day drill-down
│   │   ├── performance/        # Signal accuracy + P&L attribution
│   │   ├── backtest/           # Strategy backtesting lab
│   │   └── ...
│   ├── terms/                  # Public ToS page
│   ├── risk/                   # Public Risk Disclosure page
│   ├── w/[token]/              # Public shared-watchlist viewer
│   ├── login/
│   └── register/
├── components/
│   ├── ui/                     # Design system (Button, Card, Badge, SymbolLink, etc.)
│   ├── dashboard/              # Page-specific components
│   │   ├── tradingview-chart.tsx           # TradingView Advanced Chart embed
│   │   ├── position-detail-sheet.tsx       # Click-position-row drawer
│   │   ├── layout-switcher.tsx             # Named dashboard-layout dropdown
│   │   ├── cockpit-watchlist.tsx           # Analysis page watchlist + switcher
│   │   └── ...
│   ├── display-prefs-provider.tsx          # Global P&L/time/palette prefs
│   ├── terms-acceptance-modal.tsx          # Click-through ToS+Risk acceptance
│   └── layout/                 # Shell, nav, broker-switcher, keyboard-shortcuts
├── lib/
│   ├── trading-engine.ts       # Automated trading engine
│   ├── signal-eval.ts          # Shared signal evaluator (optimizer + mode comparison)
│   ├── optimizer.ts            # Genetic algorithm optimizer
│   ├── brokers.ts              # Alpaca/IBKR/Tradier broker clients (qty + notional)
│   ├── backtester.ts           # Strategy backtesting + Sortino/Calmar/MAR
│   ├── market-data.ts          # Yahoo/Finnhub data providers
│   ├── screener.ts             # Market scanner with auto-scheduling
│   ├── trader-client.ts        # Screener → Engine signal bridge
│   ├── watchlists.ts           # Multi-watchlist resolver helpers
│   ├── headline-sentiment.ts   # Keyword-based per-headline sentiment
│   ├── audit.ts                # Hash-chained audit log
│   ├── terms-version.ts        # ToS version (bumping re-prompts users)
│   ├── indicators/             # 10+ technical indicators
│   ├── strategy-presets.ts     # 9 preset strategies
│   ├── sp500.ts                # S&P 500 universe (auto-updates from Wikipedia)
│   ├── db/                     # Drizzle schema (28 migrations) + connection
│   └── ...
├── hooks/
│   ├── usePolling.ts           # Shared polling with Page Visibility pause
│   ├── use-recently-viewed.ts  # Recently-clicked symbols (localStorage)
│   └── use-education-progress.ts
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

- **Per-user live trading gate** — global `ALLOW_LIVE_TRADING=1` env var + per-user `live_trading_enabled` DB flag must both be true; otherwise the engine refuses to start on a live broker connection (logs `engine.live_blocked` audit row)
- **Broker-side stop orders** — placed on Alpaca when engine stops/crashes
- **Auto-restart with position sync** — detects open positions after deploy, syncs broker positions into memory, resumes with last mode (all 7 modes supported)
- **Daily loss auto-halt** — stops trading if losses exceed configured % of equity
- **Account-switch detection** — halts if `account_number` changes mid-session OR equity drops > 50% from boot snapshot
- **Order rate limit** — 30 orders / 60s sliding window per engine
- **Daily notional cap** — rejects BUYs exceeding `maxDailyNotionalPct × bootEquity` across the day
- **Consecutive-loss halt** — tracks losing trades since last winner; halts at threshold
- **Sector exposure cap** (Phase 4) — refuses BUYs that would push any sector over `maxSectorExposurePct × equity`. Reads live position market values from broker; in-memory check, no extra DB hit
- **Earnings blackout** (Phase 4) — skips BUYs within N trading days of a symbol's earnings release when `earningsBlackoutDays` is set on the risk profile
- **MTM-aware wash-sale protection** — blocks BUYs on symbols with a losing exit within 31 calendar days (turned off when user attests §475(f) MTM via Trader page). Refresh runs inside every BUY decision, not just at scan start (Phase 1)
- **PDT protection** — auto-detects equity < $25k; refuses to start intraday mode, blocks new BUYs at 3+ daytrades. Live `daytradeCount` re-evaluated inside every BUY decision (Phase 1)
- **bootEquity day-boundary re-snapshot** (Phase 1) — the 50% equity-collapse tripwire stays calibrated as the account grows; all 3 scan paths refresh at trading-day boundary
- **Engine-gated manual operations** — manual orders + broker switching refused while engine runs (UI banner + API 409 `ENGINE_RUNNING`) to prevent position-map drift
- **SPY trend filter** — blocks all buys when SPY below 20-day SMA
- **Signal cooldown** — 2.5 hours between same-symbol buys
- **STRONG_BUY overflow** — BUY signals respect maxPositions; STRONG_BUY can exceed by up to 50%
- **Max exposure cap** — from risk overrides in DB
- **Limit orders** — no market orders for entries (controlled fills)
- **Intraday flatten** — closes all positions at 3:00 PM ET
- **Risk overrides from DB** — all fields optional; empty = engine defaults. Only user-set fields impose limits
- **Dashboard always shows broker data** — account balance and positions fetched live from Alpaca regardless of engine state
- **Hash-chained audit log** — every privileged action recorded with `prev_hash → hash` linkage. Tamper-evident `/dashboard/admin/audit` page with one-click verify

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

The Tax Center is wired to the Education section:
- **`PersonalizedTaxEducation`** ranks education links by user data (harvestable losses, trade count, estimated tax). Links adapt their blurbs to actual numbers.
- **`TaxStatusCard`** lets the user self-attest Trader Tax Status and §475(f) MTM election year. Pure record-keeping — Sentinel does not file Form 3115 with the IRS or validate qualification. Stored in the `user_tax_status` table.

## Education & Personal Finance

`/dashboard/education` is a hub with three top-level tabs (**Glossary** | **Guides** | **Calculators**) plus dedicated routes for guides and spaced-repetition review.

### Content (all typed TS data — adding is just an array push)

| Layer | Count | Source |
|---|---|---|
| Long-form guides | 14 | `src/lib/education/guides-data.ts` |
| Glossary terms | 95 (75 wealth + 20 trading) | `src/lib/glossary-data.ts` |
| Quizzes | 70 questions across 14 guides | `src/lib/education/quizzes-data.ts` |
| Calculators | 8 | `src/components/education/calculators/*.tsx` |

Guides cover Roth IRA, HSA, 529, permanent life insurance, term life, order-of-operations, Backdoor/Mega Backdoor Roth, Trader Tax Status & §475(f) MTM, Wash Sale rules, Quarterly Estimated Taxes, Estate Planning, Roth Conversion Ladder, Asset Location, and Social Security Claiming. Calculators include Roth vs Traditional, College Funding Compare, Term vs Whole Life, Tax-Loss Harvesting, 401(k) Match Optimizer, Compound Interest, FIRE Number, and Quarterly Tax Estimator.

### Cross-feature integration

- **AI Chat RAG** — `gatherChatContext()` calls `searchGuides(query, 3)` (in-memory inverted index, TF-IDF + boosts) to inject relevant guide snippets into the system prompt. Chatbot answers cite guides at `/dashboard/education/guides/<slug>#<sectionId>`.
- **Tax Center & Trader page** — see Tax Center section above. Trader page also hosts `TraderTaxCallouts` showing harvestable unrealized losses with MTM-aware messaging.
- **Dashboard widgets** — `NetWorthWidget` (aggregates paper portfolios + live broker positions via `/api/portfolio/summary`) and `ContinueReadingWidget` (next education action) registered in `widget-registry.ts`.
- **Glossary auto-link** — `GlossaryAwareText` wraps known glossary terms inline inside guide paragraphs/lists/callouts with hover-tooltip definitions.
- **Print/PDF export** — `PrintButton` triggers `window.print()`; full `@media print` stylesheet in `globals.css` produces a clean PDF with the disclaimer prominently boxed.

### Spaced-repetition review

`/dashboard/education/review` runs an SM-2 algorithm over the glossary. Users grade recall on a 0–5 scale (Anki-style); intervals grow with success and reset on lapses. Ease factor stored as integer ×100 in `glossary_review_state`.

### Database

| Table | Purpose |
|---|---|
| `education_guide_views` | Per-user view count, bookmark, quiz state (`quiz_score`, `quiz_total`, `quiz_passed_at`, `quiz_attempts`). Slug is text — guides live in TS, no FK to a guides table. |
| `glossary_review_state` | SM-2 per `(user_id, term_id)`. `ease_factor` x100 integer. |
| `user_tax_status` | One row per user. Self-attested TTS + MTM election year + notes. |

Migrations: `0013_education_guide_views.sql`, `0014_education_guide_quiz.sql`, `0015_education_review_and_tax_status.sql`. All idempotent.

### Disclaimers

`<EducationalDisclaimer />` (full + compact) is on every guide top + footer, every calculator, the hub page, and the guides index. Tagged with `data-print-disclaimer` for prominent rendering in PDFs. Tax-status modal carries an additional "self-attestation only" warning.

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
| **Dashboard** | Home (multi-layout, resizable widgets) | Command center with watchlist, signals, P&L |
| **Analysis** | Analysis, Heatmap, Correlation, Relative Strength, Multi-TF, Breadth, Sector Rotation, Unusual Activity, Risk | Chart structure and market views. Toggle between engine view (with signal markers) and TradingView Advanced Chart. **Focus mode** collapses the sidebar; **Maximize** button expands either chart to fill the viewport (Esc to exit) |
| **Screener** | Screener | Scan market for setups, feeds signals to engine |
| **Trader** | Live Trader, Strategies, Backtest, **Compare** (`/backtest/compare`), Optimizer, Alerts, Calculator, Replay, Risk Sim, **Trade ticket** (`/trade/[symbol]`) | Execution and strategy management. Manual order ticket supports market/limit/stop/stop-limit/bracket + fractional shares (dollar-based buys) — engine-gated so the in-memory position map can't drift. **AI ✨** button on every Recent Trades row generates a Groq-powered plain-English journal summary, cached on the row |
| **Journal** | Journal (v2 — auto-stubs on filled trades, daily pre/post-market prompts, AI weekly review, behavioral pattern badges, categorized tagging), Performance (with P&L attribution by symbol + Journal cross-link), P&L Calendar (clickable days → drill-down + journal cross-link), Tax Center, Tax Report, Drawdown, Reports | Trade review and tracking |
| **Research** | News (per-headline sentiment badges), Articles (auto-populated daily by the market-digest cron), Filings, Insights, **Congress** (federal Periodic Transaction Reports), Education (15 guides + 8 calculators (now accordion) + 100 glossary terms + spaced-repetition review) | Market research and personal-finance education |
| **Macro** | Calendar, Earnings (prominent "Add ticker" affordance — persists to watchlist), Currency, Policy | Economic events and FX |
| **Community** | Feed, Forum, Posts, Leaderboard, **Messages** (private DMs) | Social trading |
| **Help** | **Support** (ticketed customer support with admin reply view) | Bug reports, questions, requests |
| **Admin** | Admin (Users, Invites), Audit Log (hash-chained), **System Configuration** (`/dashboard/admin/system-config` — encrypted server-wide API keys: Groq, Finnhub, Anthropic; Test-before-save flow; rotate without SSH), Settings (Display preferences: P&L $/%, time format, color-blind palette, default landing page, daily-digest email opt-in) | User management, audit, server-wide config |
| **Portfolio** | `/dashboard/portfolio` overview | Aggregates paper portfolios + live broker positions with sector allocation + winners/losers. Inline "Create paper portfolio" form when empty (no more dead-end). |
| **Public** | `/terms`, `/risk` (ToS + Risk Disclosure), `/w/[token]` (shared watchlists) | Click-through legal + public surfaces |

### Watchlists

Multiple named lists per user, DB-backed (replaces the old localStorage workspaces). Each list can be marked default; the default is what every other widget/page sees as "your watchlist." Lists can be shared publicly via `/w/[token]` (revocable per list).

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Cmd`/`Ctrl` + `K` | Command palette — fuzzy nav + symbol jump (type a ticker → Open chart / Trade) |
| `T` | Trader |
| `A` | Analysis |
| `S` | Screener |
| `W` | Watchlists |
| `J` | Journal |
| `N` | News |
| `?` | Show the keyboard-shortcuts help modal |

Single-key shortcuts only fire when no modifier is held AND the user isn't typing in an input.

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
ENCRYPTION_KEY=32-bytes-base64       # AES-256-GCM for broker API keys at rest
```

Optional:
```
FINNHUB_API_KEY=           # Fallback market data + Congress trades + earnings transcript metadata
ANTHROPIC_API_KEY=         # AI chat analysis + daily market digest
NEXT_TELEMETRY_DISABLED=1
CRON_SECRET=               # Shared secret for /api/cron/* routes

# Live trading gate — engine refuses to start on live broker connections without this set.
# Per-user `live_trading_enabled` DB flag is a second gate above this.
ALLOW_LIVE_TRADING=        # set to 1 to enable live; leave unset for paper-only

# Outbound email (Resend) — required for invite emails, support replies,
# daily digest emails (opt-in), and engine alert emails to send.
# Without these, /api/admin/invites still creates the invite row and returns a copyable
# signup link, but no email is delivered.
RESEND_API_KEY=
EMAIL_FROM=Sentinel <noreply@guardcybersolutionsllc.com>

# Push notifications (web-push protocol)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@example.com
```

> **Invite emails:** Sentinel's registration is invite-only. Admins create invites at `/dashboard/admin` → an email with a signup link is sent via Resend. The `EMAIL_FROM` domain must be Resend-verified — for prod that's the shared GuardCyber apex (see GuardCyber `README.md` § Email Infrastructure for the DNS setup).

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
