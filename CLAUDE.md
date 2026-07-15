# Sentinel — Trading Intelligence Platform

## Git commits
- **Do NOT add `Co-Authored-By: Claude` trailers to git commit messages.** All commits should be attributed solely to the human author. The harness's default git-commit template suggests adding the trailer; ignore that here. Historical commits from before 2026-05-17 that already include the trailer are remapped via `.mailmap` so they don't fragment the GitHub Contributors graph.

## Tech Stack
- Next.js 15.3 + React 19 + TypeScript
- Tailwind CSS 4 (uses `@theme` block in globals.css, NOT tailwind.config.ts)
- Drizzle ORM + PostgreSQL (48 migrations as of `0047_alert_last_condition_nullable.sql`) — **verify each migration actually applied on prod post-deploy** (query `information_schema.columns`, don't assume; 0046/0047 sat unapplied Jun 27→Jul 14 and silently disabled all risk limits — see `docs/changelog.md` 2026-07-14)
- Groq (`llama-3.3-70b-versatile`) for all AI flows — Anthropic SDK was removed 2026-05-12 (see § AI Providers below)
- Lucide React icons
- Lightweight Charts (TradingView) for charting
- Vitest for testing (799 tests across 60 suites — engine-safeguards, swap-sell planner, engine-snapshot, scan cancellation, graduation, split-adjustment, signal-stop-tighten, accuracy, audit, analyzer, market-regime, tax-report, etc.)
- Alpaca Markets API for paper/live trading
- Stripe for billing (Free / Trader $20 / Premium $40 / Self-Hosted) — webhook handler at `/api/webhooks/stripe`, sandbox + portal at `/api/billing/{checkout,portal}`

## Architecture: Multi-Tenant Trading Engine

> **Building/maintaining engine, backtester, optimizer, broker, or tax code?** Read `docs/patterns-trading.md` first — the build-patterns + recurring-bug-classes cookbook (backtest fidelity, optimizer/GA discipline, halt accounting, fill reconciliation, risk gating, broker numeric guards, market-data freshness, tax). It complements `docs/ENGINE_RULESET.md` (current behavior) and `docs/changelog.md` (history); most patterns trace to `docs/audit-2026-06-17.md`.

### Engine Isolation
Each user gets their own independent trading engine instance:
- `globalThis.__tradingEngines`: `Map<userId, EngineState>` — per-user engine state
- `globalThis.__enginePositionMaps`: `Map<userId, Map<symbol, TrackedPosition>>` — per-user position tracking
- Users can run different modes simultaneously (admin on optimized, user B on tactical)
- Engine controls (start/stop/halt/switch) are scoped to the authenticated user

### Data Scoping
All trader tables are scoped by `userId`:
- `traderTrades` — trade history with `broker_order_id` (Alpaca) and `signal_id` (Sentinel)
- `traderDailyPnl` — daily P&L with `halt_reason` and `engine_mode`
- `traderSignals` — signal log (pure Sentinel metadata, Alpaca doesn't track these)
- `traderStatus` — engine heartbeat, mode, watchlist (per-user)
- `traderPositions` — **DEPRECATED** (table exists but is never read/written; broker is source of truth)

### Alpaca as Source of Truth
Positions come from the broker, not the DB: `client.getPositions()` on every scan + dashboard load → `getBrokerPositionCache(userId)` fallback when the broker is unreachable → no DB fallback (`traderPositions` unused). `syncPositionMapFromBroker()` reconciles the in-memory map every scan.

### Signal Pipeline (Unified)
All components share `analyzeBars()` (`src/lib/indicators/analyzer.ts`):
- **Engine** — `analyzeHybrid()` → `analyzeBars(symbol, bars, signalParams?)`, passing optimizer-tuned params in "optimized" mode.
- **Optimizer** — `analyzeSignalOnly()`, a lightweight same-logic variant accepting tunable `SignalParams`.
- **Screener** — `analyzeHybrid()` with hybrid layers off (pure technicals); the engine re-applies hybrid layers on the pushed signal, so trade quality is unchanged.
- **Multi-Timeframe** — `analyzeBars()` at 5m + 1d, computes confluence.
- `SignalParams` (emaFast, emaSlow, rsiOversold, rsiOverbought) flow via `HybridPipelineOptions.signalParams`.

### Optimized mode (post-PR-14)

2026-05-26 prod showed tactical-smart outperforming optimized. Response ("lean into the difference"): close 3 structural gaps, preserve what makes optimized distinct. Full PR-by-PR rationale in `docs/changelog.md`; current behavior in `docs/ENGINE_RULESET.md`.

**Closed gaps (now matches tactical-smart):**
- **Universe** — `runScan` consumes the screener feed via `selectExternalSymbolsForTactical(engine.externalSignals, SCAN_UNIVERSE)`: top-50 by analyzer confidence, BUY/STRONG_BUY only, dedup'd against SCAN_UNIVERSE (was unfiltered + uncapped).
- **Take-profit graduation** (`MODE_GRADUATION_DEFAULT.optimized = "enabled"`) — GA-tuned `pos.takeProfit` becomes a graduation point: first crossing locks `pos.stopLoss` to entry × 1.30, then holds until 2-of-3 weakness signals (volume contraction, plateau, RSI rollover).
- **Active rotation** (`MODE_SWAP_SELL_DEFAULT.optimized = "enabled"`) — on a scan exit, top deferred STRONG_BUY candidates (capped-out earlier in the loop) get bought post-loop to redeploy freed capital. Optimized's runs in `runScan` post-loop; tactical-smart's pair-wise swap-sell stays in `runTacticalSmartScan`.

**Preserved distinctions:**
- **Per-symbol GA params** — own `stopLossPct`, `takeProfitAtrMult`, `trailingStopPct`, `holdPeriod`, RSI bounds, EMAs. Tactical-smart uses uniform defaults (entry × 0.88 stop, × 1.50 take, 11.7% trail, 999 hold).
- **Fixed position sizing** — `equity × positionPct`. Tactical-smart uses inverse-volatility weighting.
- **Finite hold period** — GA-tuned ~33 days vs tactical-smart's 999 (effectively never).
- **GA fitness is TRAIN-ONLY** (2026-05-28) — `excessReturn × sharpeMult × drawdownMult`, multipliers floored at 0.05. Holdout scored once as genuine OOS (no longer blended into fitness). Both backtesters apply shared `BACKTEST_COSTS` (default 5 bps/$0). Survivorship bias only partially fixed: PIT membership on `sp500`; `top50`/`top150` still today's-winners. **Re-run optimizer after any fitness/cost change.** Full detail in `docs/ENGINE_RULESET.md`.

**Per-mode opt-in maps:**
| Map | Optimized | Tactical-smart | Others |
|---|---|---|---|
| `MODE_LADDER_DEFAULT` (breakeven promote) | `full` | `breakeven_only` | `full`/`disabled` per mode |
| `MODE_GRADUATION_DEFAULT` (take-profit graduation) | `enabled` | `enabled` | `disabled` |
| `MODE_SWAP_SELL_DEFAULT` (post-exit redeploy) | `enabled` | `disabled` (uses own pair-wise) | `disabled` |

**Implementation notes** (full PR-by-PR rationale in `docs/changelog.md`):
- **Graduation gates BOTH scan paths** — `runScan` (15-min) and `runExitCheck` (1-min) both gate on graduation mode, else 1-min poll exits before 15-min scan can graduate.
- **Backtester graduation parity** — `runBacktest` + `portfolioBacktest` simulate graduation; swap-sell parity NOT yet mirrored (single-symbol backtest lacks candidate pool).
- **Stop-sync hung-scan recovery** — scheduler runs sync when scan age > `STALE_SCAN_OVERRIDE_MS` (10 min) instead of skipping on stale `scan_in_flight` flag.
- **Cooperative scan cancellation** — each scan holds `myGeneration`; override bumps `engine.scanGeneration` and stale scan throws `ScanCancelledError` at yield points.
- **Engine state persistence** — `src/lib/engine-snapshot.ts` writes position map + risk counters to `trader_engine_snapshot` (migration `0040`) per `runScan`; hydrated in `startEngine`, discarded if older than 60 min.
- **Swap-sell planner** — pure `planSwapSellRedeploy()` returns the decision tree; `runScan` executes only the I/O parts.

### Screener (Shared)
The screener scans market data, shared across users (not per-user). It pushes actionable signals (BUY/STRONG_BUY, confidence ≥ 0.6) to the engine via `pushExternalSignal()` — in-memory, expire after 30 min. Optimization runs are admin-only; results (strategy params) are shared globally.

**Concurrency:** `scanAllSymbols`/`scanAllSymbolsIntraday` store the in-flight promise on `cache.scanInFlight`, so concurrent callers await the running scan instead of getting an empty cache. The route surfaces `cache.scanning`; `scannedAt` is `null` until the first scan completes.

**Performance:** `SCREENER_CONFIG.batchSize = 25`, 50ms inter-batch delay, 5m-bar disk cache TTL 11min (> the 5min scan interval so the next scan hits cache fully). Hybrid layers (sentiment/options/analyst) are NOT run here — they serialize through Finnhub's 60 req/min limiter and pushed full scans to 15–45 min. Pure-technical scans: ~30–60s cold, ~10s warm.

### Tax Center Data Sources
`/api/tax/report` and `/api/tax/harvesting` merge manual portfolio entries + live engine activity:
- **Realized gains:** `portfolioTrades` (manual) + `traderTrades` (engine fills, `status=FILLED`, scoped by `userId`, filtered by `fillTime` for correct tax year; `BUY`/`SELL`/`manual_close` normalize to `BUY`/`SELL`).
- **Harvesting candidates:** `portfolioPositions` (manual) + `getBrokerPositionCache(userId)` (live broker, no DB query).

The separate `/dashboard/tax` page (Form 8949) reads engine trades only; Tax Center is the unified view.

### Broker Connections
Each user has their own broker connection (`brokerConnections` table, scoped by `userId`). The engine resolves the active connection for the authenticated user via `resolveBrokerClient(userId)`.

## Design System

### Theme: 5 themes (dark default; light, coral, light-blue, gray)
All tokens defined in `src/app/globals.css` `@theme` block. **Dark is the default for first-time visitors** (2026-07-15 — matches the low-light trading-terminal identity); `light` is the class-less base theme in CSS terms, applied only when explicitly chosen. `/public/theme-init.js` runs blocking in `<head>` and stamps the stored (or default `dark`) class **before first paint** — no theme flash; `<html>` carries `suppressHydrationWarning` for this. Each non-light theme = a single class on `<html>`: `dark`, `coral`, `light-blue`, `gray`. Only one applies at a time; the theme provider strips others before adding the new one.

| Theme | Surface character | Accent |
|-------|-------------------|--------|
| light | white on neutral gray, classic | emerald |
| dark | emerald-tinted near-black | emerald |
| coral | warm peach surfaces (light variant) | coral (#f97066) |
| light-blue | cool sky tints (light variant) | blue-500 |
| gray | true neutral grays (dark variant, no green tint) | emerald |

Trading semantics (`bullish`, `bearish`, `warning`) stay universal red/green across all themes so P&L is recognizable.

**ThemeProvider** (`src/components/theme-provider.tsx`): persists to `localStorage("sentinel-theme")`, sets `<html>` class, updates PWA `theme-color`. `useTheme()` → `{ theme, setTheme, toggleTheme }`. `isDarkTheme(theme)` (true for `dark`/`gray`) exported for TradingView embed.

**Theme picker** (`src/components/theme-picker.tsx`): `variant="icon"` (palette button, downward popover; dashboard top bar + landing navbar) and `variant="sidebar"` (full-width button, upward popover; mobile drawer of `TopNavShell` — name predates layout swap, means "stacked-menu button" not literal sidebar).

**Landing page** uses separate `ld-*` tokens (`bg-ld-deep`, `text-ld-accent`, …) that also switch via `html.dark` overrides.

**Backgrounds** (dark, higher elevation = lighter): `bg-bg-primary` (10%L) → `secondary` (13%) → `surface` (16%) → `elevated` (20%) → `hover` (24%). **Text:** `text-text-primary` (96%) / `secondary` (68%) / `muted` (50%). **Borders:** `border-border` (28%) / `border-border-hover` (36%). **Accent:** `text-accent`/`bg-accent` (emerald), `bg-accent-hover`.

**Trading semantics:** `text-bullish` / `text-bearish` / `text-warning` (badges use the `/10` tint). `font-mono` for ALL financial numbers.

### Typography
- Display/Body: Geist Sans (`geist` npm package) | Monospace: Geist Mono / JetBrains Mono (`font-mono`)
- Page title: `text-2xl font-semibold tracking-tight`
- Card title: `text-sm font-semibold text-text-primary`
- Stat label: `text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted`
- Body: `text-sm` (0.875rem) with `leading-relaxed` for paragraphs
- Stat values: always `font-mono` for tabular alignment

### Border Radius
Cards: `rounded-xl` | Buttons: `rounded-lg` | Inputs: `rounded-lg` | Badges: `rounded-full` | Modals: `rounded-xl` | Dropdowns: `rounded-lg`

**Design anti-patterns (NEVER do these — Impeccable bans):**
- No `rounded-[22px]`, `rounded-[24px]`, `rounded-3xl` — use standard Tailwind radii only
- No gradient backgrounds on UI surfaces (`bg-[linear-gradient(...)]`)
- No side-stripe borders (`border-left: 3px solid` accent bars on cards/nav)
- No gradient text (`background-clip: text` with gradients)
- No heavy box-shadows or glassmorphism on every surface

### Animations
`animate-fade-in` (0.2s) | `animate-scale-in` (0.15s) | `animate-slide-up` (0.25s) | shimmer (skeleton loading)
All use `cubic-bezier(0.16, 1, 0.3, 1)` (expo ease-out) — no bounce/elastic easing

## Component Library (`src/components/ui/`)

Always use existing components — never recreate them:
- **Button** — variants primary/secondary/ghost/destructive/outline, sizes sm/md/lg, `loading` prop
- **Card / CardHeader / CardTitle** — `rounded-xl`, optional `hover`, selected `border-accent/50`
- **Badge** (default/bullish/bearish/warning/neutral, pill) + **SignalBadge** (STRONG_BUY…STRONG_SELL → Badge variants)
- **StatCard** — label/value/subtext, tone coloring, bare icon
- **Input** (label/error/icon, `rounded-lg min-h-[44px]`), **Select, Textarea, Checkbox, Toggle**
- **Modal** suite — focus trap, Escape close; **Tabs / TabPanel** — underline, active `text-accent`
- **ConfirmActionModal / useConfirmAction** — the ONLY way to confirm destructive or money-moving actions (native `confirm()`/`alert()` are banned in dashboard code as of 2026-07-15). Supports summary rows (font-mono), typed-keyword gate for book-wide liquidations, inline error + busy state. `const { requestConfirm, dialog } = useConfirmAction()` → render `{dialog}` once per page
- **Pagination** (ellipsis), **Skeleton** (shimmer), **EmptyState** (icon/title/desc/CTA)
- **Toast** (`useToast()`, solid bg), **Dropdown** + **Tooltip** (solid `bg-bg-elevated`, `rounded-lg`)
- **Avatar, SearchInput, CommandPalette, DataTable**

## Registration & Invites

Two registration paths share one endpoint:

1. **Public free signup** (`/register`) — anonymous, no invite needed. Creates a `free`-tier account. IP rate-limit (5/60s) + honeypot field + bcrypt. Tier is hardcoded `free` server-side; clients cannot upgrade themselves at signup.
2. **Plan-intent signup** (`/register?plan=trader|premium&cadence=month|year`) — same anonymous path, but the page renders plan-aware UI ("Start your Trader trial — $20/mo") and after successful signup forwards to `/dashboard/billing?upgrade=<tier>:<cadence>`, which auto-fires Stripe Checkout. The account is still created at `tier=free`; the real grant comes from the Stripe webhook after payment. Driven by the `/pricing` "Start with Trader / Premium" CTAs.
3. **Invite-token signup** (`/register?token=...`) — admin-issued. Email pre-filled and locked; tier still inserts as `free` (admin upgrades post-signup via the admin UI or Stripe). Used for closed cohorts where admin wants to control who lands.

**Key files:** `invites` table (`src/lib/db/schema/invites.ts`); admin list/create at `src/app/api/admin/invites/route.ts`; token check at `.../auth/validate-invite`; `.../auth/register/route.ts` handles all three paths (tier always hardcoded `free` server-side); `src/app/register/page.tsx` branches on `?token=`/`?plan=`/neither; `src/app/dashboard/billing/page.tsx` reads `?upgrade=<tier>:<cadence>` → auto-fires `/api/billing/checkout`.

**Admin UI:** Invitations section — send invites, table with status (Pending/Registered/Expired), copy-link.

### Email delivery (Resend)

Invite + alert emails go through **[Resend](https://resend.com)** via `src/lib/email.ts` (`sendInviteEmail`, `sendAlertEmail`; branded HTML inlined). Prod env (`/opt/apps/sentinel/.env`): `RESEND_API_KEY` (sending-only key). `EMAIL_FROM` intentionally unset — defaults to `Beacontry <hello@beacontry.com>`, DKIM-aligned with the Resend-verified `beacontry.com` so DMARC passes without per-app DNS. (Legacy GuardCyber apex `guardcybersolutionsllc.com` still verified for other apps; Beacontry stopped using it 2026-05-14.)

- **Graceful fallback** — missing `RESEND_API_KEY` → helpers log `"Email not configured"`, return `{ success: false }`, never throw; the invite route still creates the DB record and returns the signup URL for manual copy/paste.
- **Rotating the key** — rotate in Resend, update `.env`, then **`podman stop && rm && run`** (`podman restart` does NOT re-read the env-file). Full procedure in the deploy runbook.
- **Inbound mail** — Cloudflare Email Routing catch-all forwards everything to the admin inbox. See GuardCyber `README.md` § Email Infrastructure.

## Risk Profile (Single Source of Truth)

Risk settings live on the **Trader page** only (not Settings). Stored in `user_risk_profiles` table, loaded by the engine via `loadRiskLimits()` in `trading-engine.ts`.

| Field | Engine Effect |
|-------|---------------|
| `accountSize` | Base for position sizing and exposure calculations |
| `maxDailyLossPct` | Engine auto-halts when daily losses exceed this % |
| `maxPositionPct` | Position size as % of equity; also determines max position count (100/pct) |
| `maxPositionSize` | Hard cap on shares per order |
| `maxExposureMultiplier` | Total portfolio exposure as multiple of equity (default 1.5×) |
| `maxDrawdownPct` | Used with accountSize for legacy exposure calc when multiplier isn't set |
| `riskTolerance` | Presets only — pre-fills other fields |
| `maxSingleTradeLoss` | Informational — not enforced by engine |
| `maxDailyNotionalPct` | Cap on gross BUY notional / day as fraction of equity (default 1.0 = 100%) |
| `maxConsecutiveLosses` | Auto-halt threshold; resets on any winning trade (default 5) |
| `trailActivationProfitPct` | Trail stays dormant until peak rises this fraction above entry (NULL/0 = always-active). Recommended `0.05` per 2026-06-11 robustness sweep |
| `trailActivationBars` | Trail stays dormant for N trading days after entry (NULL/0 = always-active). Less robust than profit gate; tuning-only |

**Engine boot:** Engines auto-restart on server startup via `instrumentation.ts` → `bootEngines()`. Checks all users with active broker connections, restores last-used mode.

## Live Trading

Live trading is gated behind `ALLOW_LIVE_TRADING=1`. Without it, the engine refuses to start on any `environment="live"` broker connection and emits `engine.live_blocked`. Paper unaffected.

**Safeguards on every live engine** (independent of risk profile):
- Account-switch detection — halt on `account_number` change OR equity drops > 50% from boot snapshot
- Broker auto-halt after 5 consecutive `getPositions()` failures
- Order rate limit: 30 orders / 60s sliding window per engine
- Daily notional cap: rejects BUYs exceeding `maxDailyNotionalPct × bootEquity` (cumulative across the day)
- Consecutive-loss halt at threshold
- **Mark-to-market drawdown halt** (2026-06-10): scan-end halt when `realized + unrealized < -1.5 × dailyLossThreshold`. Catches the bleed before it converts to realized losses (admin's Jun 8 had -$829 unrealized with no halt; the realized-only gate only caught it on Jun 9 *after* stops fired). Does NOT cancel pending orders — protective stops keep firing. Audit metadata `reason=daily_loss_unrealized`.

All halts emit `engine.halted` audit events with `metadata.reason ∈ {broker_unreachable, account_mismatch, equity_collapse, consecutive_losses, user_requested_flatten_all}`.

**Phase 5 — Personalized live protections** (layered on the safeguards above):
- **MTM election** (Trader → Tax election card): self-attested §475(f) → `user_tax_status`. MTM unchecked → wash-sale ON; checked → OFF (MTM exempt from §1091). Effective on next engine start.
- **Wash-sale protection**: blocks BUYs on a symbol with a losing exit (`SELL`/`manual_close`, `pnl < 0`) in the last 31 calendar days. Symbol-level not lot-level (over-conservative but simpler); set refreshed every 5 min from `trader_trades`; audit reason `wash_sale_protection`. Does NOT catch manual Alpaca-UI buys, "substantially identical" ETFs, or different share classes (GOOG ≠ GOOGL).
- **Losing-reentry cooldown** (2026-06-10): strategy gate, independent of MTM. Same query as wash-sale but a **5-calendar-day** window (shipped at 3, tuned to 5 the same day — the 3-day cutoff missed a 72.8h COHR re-buy); blocks the falling-knife re-entry pattern that the wash-sale gate misses on MTM-elected engines. Off in `tactical` mode only. Audit reason `losing_reentry_cooldown`. See `docs/ENGINE_RULESET.md` § Losing-Reentry Cooldown for the post-mortem this came from. **Note:** both this and wash-sale were silently dead until 2026-07-15 (drizzle Date-param bug — see changelog); the first real gate blocks date from then.
- **PDT protection — retired 2026-06-04.** FINRA Rule 4210 amended; PDT designation eliminated, $25k minimum replaced by standard $2k margin floor. Alpaca aligned same day. Preemptive PDT block + state removed; reactive handling (`isPdtRejection()` for Alpaca error `40310100`, exit-suppression, unprotected-symbols banner) kept for transitional accounts. `AuditAction.ENGINE_PDT_VULNERABLE` enum preserved for historical rows; event no longer emitted.

Gate ordering inside `canPlaceBuyOrder()`: earnings blackout → **split blackout** → sector exposure → losing-reentry cooldown → wash-sale → notional → rate-limit (cheapest first). Split blackout (2026-07-15): refuses BUYs on symbols with an announced split ex-date within 5 calendar days (`getSplitCalendar()` on the Alpaca client → shared daily cache); held positions **exit at market on the last trading day before the ex-date** (`pre_split_exit` via the 1-min exit poll) — brokers cancel open GTC stops on the ex-date, so holding through means an unprotected window on top of the phantom-P&L risk. Losing exits enter both blocked sets **synchronously** via `recordRealizedExit(engine, pnl, riskLimits, symbol)` (2026-07-14) — the 5-min DB refresh is backfill, not the primary path; persistent refresh failure (>15 min) writes `engine_alerts` kind `protection_degraded`.

**Corporate actions (2026-07-14):** `detectSplitAdjustment()` (qty moved >10%, total basis conserved within 2%) rescales tracked positions in `syncPositionMapFromBroker`; the 1-min exit check re-verifies against the broker before firing a stop on a quote < 60% of entry; the reconciler corrects basis on integer entry/fill ratios. Audit action `engine.position_split_adjusted`. Born from the CRWD 4:1 phantom −$2,829 (see changelog 2026-07-14).

**Sell-signal exits are demoted to stop-tighten (2026-07-14):** SELL/STRONG_SELL from the analyzer raises `pos.stopLoss` via `tightenStopOnSellSignal()` (1/2 or 1/3 of the dynamic trail) instead of market-exiting — 30 signal exits had gone 1-for-30 (−$2,717). Update `docs/ENGINE_RULESET.md` + `public/docs/engine-ruleset.html` together if this changes again.

**Recommended risk profile for a $5k live account:** mode `optimized`/`adaptive` (tactical-smart's loose stops assume larger equity); `maxPositionPct` 25-33%; `maxDailyLossPct` 2%; `maxDailyNotionalPct` 0.5; `maxConsecutiveLosses` 3; MTM unchecked unless §475(f) filed at last year-start.

> **Going-live procedure, paper-vs-live differences, and 3-option rollback procedures** (env-only → code revert → migration drop) live in `docs/runbooks/live-trading.md`. Read it before flipping `ALLOW_LIVE_TRADING=1` or when planning a rollback.

### Manual trading (first-class path alongside the engine)

Manual orders go through `/dashboard/trade` (index: symbol search + recently-viewed + watchlist quick-trade + open-orders) → `/dashboard/trade/[symbol]` (the ticket). Tier-gated at `trader`. Engine-gated at THREE layers:

1. **API** — `/api/broker/orders` POST returns 409 `ENGINE_RUNNING` via `peekEngineStatus(userId).running` (hard block).
2. **Ticket UI** — `validate()` blocks submit with "Stop the engine before placing manual orders."
3. **Index UI** — warning banner when the engine runs, linking to `/dashboard/trader` to stop it.

The block prevents position-map drift: the engine's in-memory map lags the broker by up to one scan interval, risking a protective stop sized for the wrong quantity.

Manual fills get the same audit row (`AuditAction.ORDER_PLACED`, `metadata.source = "manual_ui"`) as engine fills, the same journal auto-stub, and merge into the same Tax Center (`/api/tax/report` reads `trader_trades.action IN ('BUY', 'SELL', 'manual_close')`).

## Adaptive engine mode (8th mode, regime-driven)

`EngineMode` includes `"adaptive"` (`src/lib/trading-engine.ts`). At each scan boundary it reads market regime (VIX + SPY trend) and sets `engine.effectiveMode` to `conservative` / `moderate` / `optimized` / `aggressive`; `engine.mode` stays `"adaptive"`. Strategy decisions go through `getActiveMode(engine)`, which returns the effective mode.

**User-facing mode picker** (v3.1) shows only `optimized` / `tactical` / `tactical-smart` / `adaptive`. The base modes (`conservative` / `moderate` / `aggressive`) stay in the `EngineMode` enum (adaptive maps to them internally) but aren't directly selectable — iterate the picker via `USER_FACING_MODES` from `src/lib/trading-engine.ts`. Intraday mode was fully removed in v3.1.

**Regime rules** (centralized in `src/lib/market-regime.ts`):
- `VIX > 28` OR `SPY < SMA50` → risk_off → `conservative`
- `VIX > 18 && <= 28` AND `SPY >= SMA50` → neutral → `moderate`
- `VIX <= 18` AND `SPY > SMA50` → risk_on → `optimized`
- `VIX <= 14` AND `SPY > SMA200` AND `breadth > 75` (live only) → strong risk_on → `aggressive`

**Never auto-selected**: `tactical` (all-in/all-out contradicts a regime classifier), `tactical-smart` (already adaptive), `adaptive` itself.

**Audit:** every regime-driven mode switch writes an `ENGINE_MODE_SWITCHED` audit row with metadata `{ adaptive: true, from, to, regime, vix, spyPrice, spyMA50, reasons }`. No-op when regime stays put scan-to-scan.

**Live vs backtest:** live reads VIX + SPY + breadth; backtest replays VIX + SPY only (breadth replay is expensive). The classifier degrades gracefully — the strong-risk-on `aggressive` bump just doesn't fire in backtest.

**Mode-compare backtest** at `/dashboard/backtest/mode-compare?symbol=AAPL` runs `optimized` / `tactical` / `adaptive` against the same range (tactical-smart excluded — active-management doesn't translate to backtesting): stats table + equity-curve overlay + adaptive modeTimeline.

## Congressional trades (official source)

`/dashboard/congress` and `/api/congress` read from the local `congressional_trades` table (migration `0031`), populated by a daily cron from the official House Clerk bulk PTR archive (`disclosures-clerk.house.gov`) + Senate efdsearch. Replaces the Finnhub integration that went paid May 2026.

- **Ingesters:** `src/lib/congress-house-ingester.ts` (bulk ZIP → XML index → per-PTR PDF extract via `pdf-parse` → regex rows → upsert `ON CONFLICT DO NOTHING`) and `src/lib/congress-senate-ingester.ts` (efdsearch CSRF-token dance, Akamai-fronted → realistic UA + sequential pacing; skips paper PDFs + `--` tickers, parses with `node-html-parser`). Step-by-step detail lives in those files.
- **Cron:** `GET /api/cron/refresh-congress` (`x-cron-secret` vs `CRON_SECRET`). Current year + (Jan-Feb) prior year. Daily 6 AM ET.
- **Backfill:** `npx tsx scripts/backfill-congress.ts --years 2026,2025,2024`. Idempotent; House + Senate failures independent.

## Price/indicator alerts (scheduled, edge-triggered)

User alert rules (`alert_rules` table) are evaluated by a **scheduled cron**, not inline. `evaluateAlertRules()` in `src/lib/alert-engine.ts` is pure-ish (the caller supplies a fully-populated `AlertContext`); the engine no longer fetches data per rule.

- **Cron:** `GET /api/cron/evaluate-alerts` (`x-cron-secret` vs `CRON_SECRET`, gated to `isMarketOpen()`). One `fetchBars` per distinct enabled-rule symbol, runs `analyzeBars` once, then evaluates every rule on that symbol. Schedule every ~5 min (the route self-skips off-hours, so a flat `*/5 * * * *` is fine). **Not yet wired into prod cron — add the crontab entry.**
- **Edge-triggering:** rules fire only on the `false→true` transition and re-arm when the condition clears (`alert_rules.last_condition_met`, migration `0044`). The 1h `last_triggered` cooldown is a secondary anti-spam guard. The pure decision lives in `decideAlert()` (tested in `tests/unit/alert-engine.test.ts`). This makes "crossover" rule types signal the actual cross, not "still above since days ago".
- **History:** 2026-05-28 — replaced per-analyze trigger (symbol-only key meant strangers' analyzes drove your rule, unanalyzed symbols never checked). See `docs/changelog.md`.

## AI Providers & System Configuration

**All AI flows go through Groq (`llama-3.3-70b-versatile`)** — Insights, Quick Insight, hybrid AI scoring + sentiment, filings chat, market digest, AI chat panel, Recent-Trades AI. `@anthropic-ai/sdk` removed 2026-05-12. `CLAUDE_CONFIG` (`src/lib/config.ts`) holds `.model` + `.maxTokens` only; keys via `getLlmApiKey()` / `getFinnhubApiKey()` / `getAnthropicApiKey()` in `src/lib/system-config.ts`.

**Keys live in the `system_config` table** (migration `0030_system_config.sql`), encrypted with AES-256-GCM via `src/lib/crypto.ts`. Rotate from **/dashboard/admin/system-config** — no SSH required. Lookup order at runtime: 60s in-memory cache → DB → `process.env[<key>]` fallback. The env fallback is intentional so a fresh install boots cleanly before the admin has populated the DB.

**Audit:** every save emits a hash-chained `SYSTEM_CONFIG_UPDATED` row recording `{key, hadOldValue, valueLength}` — never the value. **Test-before-save:** the [Test] button calls `POST /api/admin/system-config/test` (1-token live-provider ping with the candidate key; not persisted, only [Save] writes). **Known keys** (allow-list in API + helper): `GROQ_API_KEY`, `FINNHUB_API_KEY`, `ANTHROPIC_API_KEY` — anything else rejected.

**Caveat — Finnhub:** the Finnhub client (`src/lib/finnhub.ts`) reads its key once at process boot, so rotating `FINNHUB_API_KEY` via the admin UI needs an app restart to take effect. The LLM path (`getLlmApiKey()`) picks up changes on the next call after the 60s cache window.

## Security & Route Patterns

### Auth on Mutating Routes
All POST/PUT/PATCH/DELETE route handlers use `requireAuthWithCsrf(request)` from `@/lib/auth`:
```typescript
const auth = await requireAuthWithCsrf(request);
if (auth instanceof Response) return auth;
// auth is JWTPayload — use auth.userId, auth.email, etc.
```
Admin routes: `requireAuthWithCsrf(request, ["admin"])`. GET handlers use `getSession()`.

**Excluded from CSRF:** `auth/login`, `auth/register`, `auth/logout`, `csrf`, `cron/*`. (The legacy `x-trader-secret` write routes — `trader/pnl`, `trader/signals`, `trader/trades` POST/PATCH — were removed 2026-05-28; the in-process engine writes those tables directly with `userId`. `trader/trades` now exposes only a session-authed GET. `TRADER_SECRET` is still used for *outbound* push via `TRADER_PUSH_CONFIG`/`trader-push.ts`.)

### Statement Timeouts on GET Routes
All GET routes with DB queries use `withTimeout()` from `@/lib/db`:
```typescript
import { db, withTimeout, isStatementTimeout } from "@/lib/db";

const results = await withTimeout(3000, async (tx) => {
  return tx.select().from(table).where(...);
});
```
Use **3s** for user-facing, **5s** for admin/export. Catch `isStatementTimeout(err)` → return 504 with `X-Query-Timeout: true` header.

### Client-Side Session Handling
- **`CsrfInit`** — patches `window.fetch` to inject CSRF token + detect 401 → redirect to `/login`
- **`SessionGuard`** — 30-min idle timeout, network online/offline toasts
- **`ToastProvider`** + `useToast()` — success/error/warning/info toasts

All mounted in `src/app/dashboard/layout.tsx`.

## Shared Hooks (`src/hooks/`)

- **`usePolling(callback, intervalMs, { enabled? })`** — shared polling with Page Visibility pause/resume. All dashboard polling must use this hook, never raw `setInterval`
- Polling intervals defined in `POLLING_INTERVALS` from `src/lib/config.ts`

## Pre-commit Hooks
Husky + lint-staged: `eslint --fix` on staged `.ts/.tsx` files. Runs automatically on `git commit`.

## Page Layout Rules

### Standard page template
Wrapper `div.p-4 lg:p-6 space-y-6` → header `div.flex flex-col sm:flex-row sm:items-center justify-between gap-3` (h1 `text-2xl font-semibold tracking-tight` + `p.text-sm text-text-secondary` subtitle + `<Button>` action) → content in Cards. Full code in `.claude/skills/sentinel-redesign/references/page-templates.md`.

### Responsive (mandatory):
- Page padding: `p-4 lg:p-6` (never bare `p-6`)
- Headers: `flex flex-col sm:flex-row` (stack on mobile)
- Grids: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (mobile-first)
- Side panels: `flex-col lg:flex-row` (never side-by-side below lg:)
- Tables: wrap in `overflow-x-auto`
- Button text: `<span className="hidden sm:inline">Full</span> Short`
- Form grids: `grid-cols-1 sm:grid-cols-2 gap-3`
- Form pages: constrain with `max-w-3xl`

### Table pattern
Wrap in `div.overflow-x-auto` → `table.w-full text-sm`; header row `border-b border-border text-text-muted text-left` (th `pb-2 pr-4 font-medium`, numbers `text-right`); `tbody.font-mono` rows `border-b border-border/50`. Full code in the page-templates reference.

### Common patterns:
- Loading spinner: `border-2 border-accent/30 border-t-accent rounded-full animate-spin`
- P&L coloring: `className={val >= 0 ? "text-bullish" : "text-bearish"}`
- Edit mode banner: `bg-accent/10 border border-accent/20` with accent icon
- Success feedback: `text-bullish` + Check icon (auto-dismiss after 3s)
- Error display: `text-sm text-bearish`
- Empty state: EmptyState component or inline centered block with muted icon

## Dashboard Pages
65 pages at `src/app/dashboard/*/page.tsx`. Public (no auth) pages: `/terms`, `/risk`, `/privacy`, `/contact`, `/pricing`, `/learn`, `/tools`, `/glossary`, `/congress`, `/articles`, `/w/[token]` (shared watchlist). See § Sub-Navigation Groups below for how they're organized in the top-bar dropdowns.

### API Routes
Browse `src/app/api/` for the full surface. Notable contracts: `/api/webhooks/stripe` (signature-verified, idempotent via `stripe_events_processed` — source of tier grants), `/api/trader/command` (engine control plane: start/stop/halt/switch/flatten-all), `/api/broker/orders` POST returns 409 `ENGINE_RUNNING` if the engine is active for that user, `/api/admin/system-config` rotates encrypted API keys (see § AI Providers), `/api/public/watchlist/[token]` is unauthenticated read backing `/w/[token]`.

## Migrations
Browse `drizzle/*.sql` for the full list (48 migrations as of `0047_alert_last_condition_nullable.sql`). All idempotent (`IF NOT EXISTS`). **Post-deploy, verify each new migration actually applied** (`information_schema.columns`) — the deploy pipeline does NOT run migrations.

> **Drizzle journal note:** `drizzle/meta/_journal.json` is reconciled through `0015`; migrations 0016–0045 + the duplicate-numbered `0001_broker_connections.sql` / `0008_social_shared_trade.sql` are applied manually on prod as `postgres` (prod's `__drizzle_migrations` table wasn't built via `drizzle-kit migrate`, so the journal is intentionally not regenerated). Fresh-DB rebuild: `for f in drizzle/*.sql; do sudo -u postgres psql sentinel_db -f "$f"; done`.

## Education Section

Located at `/dashboard/education` with three top-level tabs (Glossary | Guides | Calculators) plus dedicated routes for guides and spaced-repetition review.

### Content (all authored as typed TS data, not in DB)
- `src/lib/glossary-data.ts` — 95 glossary terms across 6 categories (`basics`, `technical`, `fundamental`, `options`, `risk`, `wealth`). Adding a term: append to `GLOSSARY_TERMS` array.
- `src/lib/education/guides-data.ts` — 14 long-form guides typed as `Guide` objects with `keyFacts` and `sections[]` of typed `GuideBlock`s (paragraph, heading, list, table, callout, key-value, calculator). Adding a guide: define a new `Guide` const, append to `GUIDES` array — slug becomes the route automatically.
- `src/lib/education/quizzes-data.ts` — 5-question quizzes per guide keyed by slug. Pass = ≥80%. Adding a quiz: add entry to `QUIZZES` map.
- `src/lib/education/spaced-repetition.ts` — pure SM-2 algorithm (`applyReview`, `initialState`); no I/O.
- `src/lib/education/guide-search.ts` — in-memory inverted index over guides for AI chat RAG (TF-IDF + query-term boosts; de-dupes by guide).

### Calculators (8)
Live in `src/components/education/calculators/*.tsx`. Adding one: register in `GuideCalculator` union (`guides-data.ts`), `Block` switch (`guide-renderer.tsx`), and the Calculators tab (`education/page.tsx`).

### Cross-feature integrations
- **Tax Center** — `PersonalizedTaxEducation` ranks links by user data; `TaxStatusCard` self-attests §475(f) MTM via `/api/tax-status`.
- **Trader page** — `TraderTaxCallouts` reads `/api/portfolio/summary` + `/api/tax-status` for MTM-aware harvestable-loss messaging.
- **AI Chat** — `gatherChatContext()` injects `searchGuides(query, 3)` snippets + citations into system prompt.
- **Dashboard widgets** — `NetWorthWidget`, `ContinueReadingWidget` (via `useEducationProgress()`) in `widget-registry.ts`.
- **Guide bodies** — `<GlossaryAwareText>` auto-wraps known terms in tooltips (multi-word first, per-paragraph dedup).

### Database & Disclaimers
Schema in `src/lib/db/schema/education.ts` — `education_guide_views` (views + bookmark + quiz state, text slug), `glossary_review_state` (SM-2 per `(user_id, term_id)`, `ease_factor` integer ×100), `user_tax_status` (TTS + MTM year). `glossary_terms` + `education_progress` are legacy/unused (kept for FK stability). `<EducationalDisclaimer />` renders on every guide/calculator/hub/Tax-Status modal, tagged `data-print-disclaimer` for PDF.

### Backtest Page
- **Strategy presets** are filtered to the 6 engine-runnable base modes (`conservative`, `moderate`, `aggressive`, `optimized`, `tactical`, `tactical-smart`) plus `adaptive` (7th, regime-driven), `custom`, and `auto`. The live-trader mode picker is filtered further to `USER_FACING_MODES` (optimized / tactical / tactical-smart / adaptive); the others remain in the backtest preset list for offline research.
- **Date-range mode**: `/api/backtest/[symbol]` accepts `startDate`/`endDate` (`YYYY-MM-DD`) in addition to `days`. Provider `fetchBars()` accepts an optional `endDate`; historical fetches (>24h in the past) bypass the disk cache. Daily bars only — Yahoo retains ~60 days of intraday history, so multi-year 5m backtests aren't possible without a paid feed.

### Sub-Navigation Groups
Pages are organized under top-bar nav items via `SUB_NAV` in `nav-config.ts`. Each section's sub-pages render in a hover-opened dropdown from the desktop top bar (`TopNavShell` in `src/components/layout/top-nav-shell.tsx`) and indented under the section name in the mobile drawer:
- **Analysis:** Analysis, Multi-TF, Heatmap, Breadth, Correlation, Risk, Relative Strength, Sector Rotation, Unusual Activity
- **Trader:** Live Trader, Strategies, Builder, Backtest, Replay, Optimizer, Alerts, Watchlists, Risk Sim, Calculator
- **Journal:** Journal, Performance, Reports, Drawdown, P&L Calendar, Tax Center, Tax Report
- **Research:** News, Sentiment, Articles, Filings, Insights, Congress, Education (hub with Glossary | Guides | Calculators tabs; Guides index at `/education/guides`, individual guide at `/education/guides/[slug]`, Spaced Review at `/education/review`)
- **Macro:** Calendar, Earnings, Currency, Policy
- **Community:** Feed, Forum, Posts, Leaderboard, Messages

---

## Changelog

Dated retrospectives of major rollouts (2026-05-12 → 2026-05-28) live in `docs/changelog.md` — multi-watchlist, manual trading, broker switching, support/DMs/ToS, journal v2, Reddit feed, tier enforcement + Stripe billing, public free-tier signup, brand rebrand to Beacontry, the security/a11y/theming hardening passes, and the 2026-05-28 six-round defensive bug hunt (31 fixes, itemized in `docs/bug-hunt-report-2026-05-28.html`). Read it for "when did X land" / "what changed in batch Y"; day-to-day work uses `git log`.

### CSP — current state (post-hotfix)

CSP is set per-request in `src/middleware.ts` (not `next.config.ts`), with a per-request nonce on `x-nonce` for Next.js dynamic-route auto-stamping. `script-src` still keeps `'unsafe-inline'` because Next.js doesn't stamp nonces on statically-rendered pages, and CSP L3 ignores `'unsafe-inline'` once a nonce/hash is present — removing it broke prod twice (`5c8bc28`, `f5377b0`). Nonce kept for forward compat; `'unsafe-eval'` is dev-only (HMR). Full reasoning in the `src/middleware.ts` comment block.

---

## Static HTML docs (served by Next.js public/)

User-facing HTML docs live in **`public/docs/`** (served at `/docs/*.html`; the repo-root `docs/` folder holds markdown source):
- `engine-ruleset.html` — engine internals (mirrors `docs/ENGINE_RULESET.md`)
- `beacontry-features.html` — per-feature user training reference
- `tiers.html` — tier breakdown + feature matrix + pricing FAQ
- `usage-slides.html` — onboarding slides

**When editing the engine ruleset, change both `docs/ENGINE_RULESET.md` AND `public/docs/engine-ruleset.html` in the same commit** — they're intentionally mirrored.

## Detailed Design Reference
For exhaustive design tokens, component APIs, and page templates, see `.claude/skills/sentinel-redesign/references/` (`design-tokens.md`, `component-patterns.md`, `page-templates.md`). Invoke `/sentinel-redesign` for the full redesign workflow.
