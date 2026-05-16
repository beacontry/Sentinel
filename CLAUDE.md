# Sentinel — Trading Intelligence Platform

## Tech Stack
- Next.js 15.3 + React 19 + TypeScript
- Tailwind CSS 4 (uses `@theme` block in globals.css, NOT tailwind.config.ts)
- Drizzle ORM + PostgreSQL
- Anthropic SDK for AI chat analysis
- Lucide React icons
- Lightweight Charts (TradingView) for charting
- Vitest for testing (267 tests across indicators, analyzer, validators, signal translator, rate-limiter, db-timeout, crypto, audit, engine-safeguards incl. wash-sale + PDT, guide-search, spaced-repetition)
- Alpaca Markets API for paper/live trading

## Architecture: Multi-Tenant Trading Engine

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
Positions come from the broker API, not the database:
1. **Live broker data** — `client.getPositions()` on every scan and dashboard load
2. **Engine cache fallback** — `getBrokerPositionCache(userId)` when broker is temporarily unreachable
3. **No DB fallback** — the `traderPositions` table is unused
4. `syncPositionMapFromBroker()` runs on every scan to reconcile the in-memory position map

### Signal Pipeline (Unified)
All components use the same signal function — `analyzeBars()` from `src/lib/indicators/analyzer.ts`:
- **Engine** calls `analyzeHybrid()` ��� `analyzeBars(symbol, bars, signalParams?)` — passes optimizer-tuned signal params in "optimized" mode
- **Optimizer** uses `analyzeSignalOnly()` — lightweight variant with same logic, accepts tunable `SignalParams`
- **Screener** calls `analyzeHybrid()` with `enableSentiment/OptionsFlow/Analyst/AiScoring: false` — pure technicals via `analyzeBars()` (shared resource, not per-user). Hybrid layers are re-applied by the engine when it processes the screener-pushed signal, so trade-decision quality is unchanged.
- **Multi-Timeframe** API calls `analyzeBars()` at both 5m and 1d resolutions, computes confluence
- `SignalParams` (emaFast, emaSlow, rsiOversold, rsiOverbought) flow through `HybridPipelineOptions.signalParams`

### Screener (Shared)
The screener scans market data and is shared across users (not user-specific). It pushes actionable signals (BUY/STRONG_BUY, confidence ≥ 0.6) to the engine via `pushExternalSignal()`. Signals are in-memory, expire after 30 minutes. Optimization runs are admin-only but results (strategy params) are shared globally.

**Concurrency:** `scanAllSymbols` / `scanAllSymbolsIntraday` store the in-flight scan promise on the cache (`cache.scanInFlight`). Concurrent callers (e.g. user clicks "Scan Market" while the scheduler is running) await the running scan rather than receiving an empty cache. The route surfaces `cache.scanning` to the client; the screener page shows "Scan in progress" when true. `scannedAt` is `null` until the first scan completes (not epoch).

**Performance:** `SCREENER_CONFIG.batchSize = 25`, inter-batch delay 50ms, 5m bar disk cache TTL = 11min (slightly longer than the 5min scan interval so the next scheduled scan hits cache fully even if the prior straddled the boundary). Hybrid layers (sentiment/options/analyst) are NOT run in the screener — without that, full-universe scans took 15–45 min because the analyst + sentiment layers serialize through Finnhub's 60 req/min rate limiter. Pure-technical scans complete in ~30–60s cold, ~10s warm.

### Tax Center Data Sources
`/api/tax/report` and `/api/tax/harvesting` merge **both** manual portfolio entries and live engine activity:
- **Realized gains:** `portfolioTrades` (manual) + `traderTrades` (engine fills, `status=FILLED`, scoped by `userId`, filtered by `fillTime` so cross-year fills land in the right tax year). Engine actions `BUY`/`SELL`/`manual_close` normalize to `BUY`/`SELL`.
- **Harvesting candidates:** `portfolioPositions` (manual) + `getBrokerPositionCache(userId)` (live broker positions — broker is source of truth, no DB query).

The separate `/dashboard/tax` page (Form 8949) reads engine trades only; Tax Center is the unified view.

### Broker Connections
Each user has their own broker connection (`brokerConnections` table, scoped by `userId`). The engine resolves the active connection for the authenticated user via `resolveBrokerClient(userId)`.

## Design System

### Theme: 5 themes (light, dark, coral, light-blue, gray)
All tokens defined in `src/app/globals.css` `@theme` block. Light is the implicit default (no class). Each non-default theme = a single class on `<html>`: `dark`, `coral`, `light-blue`, `gray`. Only one applies at a time; the theme provider strips others before adding the new one.

| Theme | Surface character | Accent |
|-------|-------------------|--------|
| light | white on neutral gray, classic | emerald |
| dark | emerald-tinted near-black | emerald |
| coral | warm peach surfaces (light variant) | coral (#f97066) |
| light-blue | cool sky tints (light variant) | blue-500 |
| gray | true neutral grays (dark variant, no green tint) | emerald |

Trading semantics (`bullish`, `bearish`, `warning`) stay universal red/green across all themes so P&L is recognizable.

**ThemeProvider** (`src/components/theme-provider.tsx`): wraps root layout, persists preference to `localStorage("sentinel-theme")`, applies the right class on `<html>`, updates PWA `theme-color` meta tag. Use `useTheme()` hook for `{ theme, setTheme, toggleTheme }`. `toggleTheme()` cycles through all 5 in declaration order; `setTheme(t)` jumps directly. `isDarkTheme(theme)` helper exported for embeds (TradingView widget) that need their own dark/light flag — returns true for `dark` and `gray`.

**Theme picker UI** (`src/components/theme-picker.tsx`): replaces the old binary toggle. Two variants:
- `variant="sidebar"` — full-width button styled to match the existing sidebar footer; upward popover with all 5 themes (swatch + label + active check).
- `variant="icon"` — 36-40px palette icon button; downward popover. Used in landing nav and mobile contexts.

**Toggle locations:** Landing page navbar (palette icon → 5-option popover), dashboard sidebar footer (full-width "Theme: X" button → 5-option popover).

**Landing page** uses separate `ld-*` tokens (`bg-ld-deep`, `text-ld-accent`, etc.) for its distinct aesthetic. These also switch with the theme via `html.dark` overrides.

**Backgrounds (dark hierarchy — higher elevation = lighter):**
`bg-bg-primary` (10% L) > `bg-bg-secondary` (13% L) > `bg-bg-surface` (16% L) > `bg-bg-elevated` (20% L) > `bg-bg-hover` (24% L)

**Text:** `text-text-primary` (96% L) | `text-text-secondary` (68% L) | `text-text-muted` (50% L)

**Borders:** `border-border` (28% L) | `border-border-hover` (36% L)

**Accent:** `text-accent` / `bg-accent` (emerald) | `bg-accent-hover`

**Trading semantics:**
- Bullish/positive: `text-bullish` | `bg-bullish/10` for badges
- Bearish/negative: `text-bearish` | `bg-bearish/10` for badges
- Warning: `text-warning` | `bg-warning/10` for badges
- Use `font-mono` for ALL financial numbers (prices, percentages, quantities)

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
- **Button** — variants: primary/secondary/ghost/destructive/outline, sizes: sm/md/lg, has `loading` prop
- **Card, CardHeader, CardTitle** — `rounded-xl`, optional `hover` prop for clickable cards, selected: `border-accent/50`
- **Badge** — variants: default/bullish/bearish/warning/neutral (pill-shaped, `rounded-full`)
- **SignalBadge** — STRONG_BUY/BUY/HOLD/SELL/STRONG_SELL mapped to Badge variants
- **StatCard** — label/value/subtext with tone coloring (positive/negative/neutral), icon without container
- **Input** — with label, error, icon props. `rounded-lg min-h-[44px]`
- **Select, Textarea, Checkbox, Toggle**
- **Modal, ModalHeader, ModalTitle, ModalFooter** — focus trap, Escape close
- **Tabs, TabPanel** — underline-style, active=`text-accent` with accent underline
- **Pagination** — with ellipsis logic
- **Skeleton** — shimmer loading placeholder
- **EmptyState** — icon + title + description + optional action CTA
- **Toast** (via `useToast()`) — success/error/warning/info with auto-dismiss, solid bg (no gradients)
- **Dropdown** — solid `bg-bg-elevated` (no gradients), `rounded-lg`
- **Tooltip** — solid `bg-bg-elevated` (no gradients), `rounded-lg`
- **Avatar, SearchInput, CommandPalette, DataTable**

## Registration & Invites

Two registration paths share one endpoint:

1. **Public free signup** (`/register`) — anonymous, no invite needed. Creates a `free`-tier account. IP rate-limit (5/60s) + honeypot field + bcrypt. Tier is hardcoded `free` server-side; clients cannot upgrade themselves at signup.
2. **Plan-intent signup** (`/register?plan=trader|premium&cadence=month|year`) — same anonymous path, but the page renders plan-aware UI ("Start your Trader trial — $20/mo") and after successful signup forwards to `/dashboard/billing?upgrade=<tier>:<cadence>`, which auto-fires Stripe Checkout. The account is still created at `tier=free`; the real grant comes from the Stripe webhook after payment. Driven by the `/pricing` "Start with Trader / Premium" CTAs.
3. **Invite-token signup** (`/register?token=...`) — admin-issued. Email pre-filled and locked; tier still inserts as `free` (admin upgrades post-signup via the admin UI or Stripe). Used for closed cohorts where admin wants to control who lands.

**Key files:**
- `src/lib/db/schema/invites.ts` — `invites` table (token, email, expiry, used)
- `src/app/api/admin/invites/route.ts` — GET (list), POST (create + send email)
- `src/app/api/auth/validate-invite/route.ts` — GET (check token validity)
- `src/app/api/auth/register/route.ts` — handles all three paths; tier always hardcoded to `free` server-side
- `src/app/register/page.tsx` — branches on `?token=` vs `?plan=` vs neither
- `src/app/dashboard/billing/page.tsx` — reads `?upgrade=<tier>:<cadence>` and auto-fires `/api/billing/checkout`

**Admin UI:** Invitations section on admin page — email input to send invites, table of sent invites with status (Pending/Registered/Expired), copy link button.

### Email delivery (Resend)

Invite and alert emails are sent through **[Resend](https://resend.com)** via `src/lib/email.ts`. Two helpers: `sendInviteEmail(to, signupUrl)` and `sendAlertEmail(to, subject, body)`. Both branded HTML templates inlined in the same file.

**Required env vars** (`/opt/apps/sentinel/.env` on prod):
```bash
RESEND_API_KEY=re_...   # Sending-only API key from Resend → API Keys
# EMAIL_FROM intentionally unset on prod — `src/lib/email.ts` defaults to
# "Beacontry <hello@beacontry.com>". Override only if self-hosting under a
# different verified domain.
```

**Graceful fallback** — if `RESEND_API_KEY` is missing, both helpers log `"Email not configured"` and return `{ success: false }`. The invite route still creates the DB record and returns the signup URL so admins can copy/paste the link manually. **Never throws**, so the app stays usable when email is mis-configured.

**Verified domain** — `beacontry.com` is verified in Resend (DKIM-signed). The in-code `EMAIL_FROM` default (`Beacontry <hello@beacontry.com>`) aligns with that DKIM so DMARC passes without per-app DNS work. The legacy GuardCyber apex (`guardcybersolutionsllc.com`) remains verified for other GuardCyber-stack apps; Beacontry no longer uses it as of 2026-05-14.

**Rotating the key:**
1. Resend → API Keys → revoke old key → create new "sentinel-prod" key (Sending access only)
2. Update `RESEND_API_KEY=` in `/opt/apps/sentinel/.env`
3. **`podman stop && rm && run`** — `podman restart` does NOT re-read the env-file, only `run` does
4. Recreate command (verbatim, from `podman inspect`):
   ```bash
   podman run -d --name sentinel-app --network=host \
     --env-file /opt/apps/sentinel/.env \
     -e NODE_ENV=production -e HOSTNAME=0.0.0.0 -e PORT=3010 \
     -e NEXT_TELEMETRY_DISABLED=1 -e CACHE_DIR=/data/cache \
     -v /opt/apps/sentinel/cache:/data/cache:Z \
     --restart always -m 2g \
     ghcr.io/beacontry/sentinel:latest
   ```

**Inbound mail** (bounces, replies to `noreply@`, anyone emailing the domain): Cloudflare Email Routing forwards everything to the admin inbox via a catch-all rule. See GuardCyber `README.md` § Email Infrastructure for the shared setup.

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

**Engine boot:** Engines auto-restart on server startup via `instrumentation.ts` → `bootEngines()`. Checks all users with active broker connections, restores last-used mode.

## Live Trading

Live trading is gated behind `ALLOW_LIVE_TRADING=1`. Without it, the engine refuses to start on any `environment="live"` broker connection and emits `engine.live_blocked`. Paper unaffected.

**Safeguards on every live engine** (independent of risk profile):
- Account-switch detection — halt on `account_number` change OR equity drops > 50% from boot snapshot
- Broker auto-halt after 5 consecutive `getPositions()` failures
- Order rate limit: 30 orders / 60s sliding window per engine
- Daily notional cap: rejects BUYs exceeding `maxDailyNotionalPct × bootEquity` (cumulative across the day)
- Consecutive-loss halt at threshold

All halts emit `engine.halted` audit events with `metadata.reason ∈ {broker_unreachable, account_mismatch, equity_collapse, consecutive_losses, user_requested_flatten_all}`.

**Phase 5 — Personalized live protections** (layered on the safeguards above):
- **MTM election** (Trader → Tax election card): self-attested §475(f), writes `user_tax_status`. MTM unchecked → wash-sale protection ON; MTM checked → OFF (MTM exempt from §1091). Toggle takes effect on next engine start.
- **Wash-sale protection**: blocks BUYs on any symbol with a losing exit (`action IN ('SELL','manual_close') AND pnl < 0`) within the last 31 calendar days. Symbol-level, not lot-level — over-conservative but simpler. Wash-sale set refreshed every 5 min from `trader_trades`. Audit reason: `wash_sale_protection`. Does NOT catch manual buys via Alpaca's UI, "substantially identical" ETFs, or different share classes (GOOG ≠ GOOGL).
- **PDT protection**: auto-detected from `account.equity < $25,000`. Mid-session re-evaluates every scan; transition emits `engine.pdt_vulnerable`. Blocks BUYs (not SELLs) when `pdtVulnerable && daytradeCount >= 3`. Audit reason: `pdt_protection`. (v3.1 — startup intraday-mode refusal removed alongside the intraday mode itself.)

Gate ordering inside `canPlaceBuyOrder()`: wash-sale → PDT → notional → rate-limit (cheapest first).

**Recommended risk profile for $5k cash-only live account:**
- Mode: `optimized` or `adaptive` (tactical-smart's loose stops + 50% take-profit assume larger equity to absorb drawdowns)
- `maxPositionPct` 25-33% (3-4 positions max — meaningful per-trade size)
- `maxDailyLossPct` 2% ($100/day stop)
- `maxDailyNotionalPct` 0.5 (50% of equity/day)
- `maxConsecutiveLosses` 3
- MTM checkbox unchecked unless you actually filed §475(f) at last year-start

> **Going-live procedure, paper-vs-live differences, and 3-option rollback procedures** (env-only → code revert → migration drop) live in `docs/runbooks/live-trading.md`. Read it before flipping `ALLOW_LIVE_TRADING=1` or when planning a rollback.

## Adaptive engine mode (8th mode, regime-driven)

`EngineMode` includes `"adaptive"` (`src/lib/trading-engine.ts`). When a user selects adaptive, the engine reads market regime at each scan boundary (VIX + SPY trend) and sets `engine.effectiveMode` to one of `conservative` / `moderate` / `optimized` / `aggressive`. The user-selected mode (`engine.mode`) stays `"adaptive"`; everywhere strategy decisions are made, code goes through `getActiveMode(engine)` which returns the effective mode.

**User-facing mode picker** (v3.1) shows only `optimized` / `tactical` / `tactical-smart` / `adaptive`. The four "base" modes (`conservative` / `moderate` / `aggressive`) remain in the `EngineMode` enum because the adaptive regime classifier maps to them internally — but they aren't directly selectable. Use `USER_FACING_MODES` constant from `src/lib/trading-engine.ts` whenever you need to iterate the picker surface (Trader page mode select, backtest mode-compare, optimizer compare). Intraday mode was fully removed in v3.1.

**Regime rules** (centralized in `src/lib/market-regime.ts`):
- `VIX > 28` OR `SPY < SMA50` → risk_off → `conservative`
- `VIX > 18 && <= 28` AND `SPY >= SMA50` → neutral → `moderate`
- `VIX <= 18` AND `SPY > SMA50` → risk_on → `optimized`
- `VIX <= 14` AND `SPY > SMA200` AND `breadth > 75` (live only) → strong risk_on → `aggressive`

**Never auto-selected**: `tactical` (all-in/all-out contradicts a regime classifier), `tactical-smart` (already adaptive), `adaptive` itself.

**Audit:** every regime-driven mode switch writes an `ENGINE_MODE_SWITCHED` audit row with metadata `{ adaptive: true, from, to, regime, vix, spyPrice, spyMA50, reasons }`. No-op when regime stays put scan-to-scan.

**Live vs backtest:** live engine reads VIX + SPY + breadth. Backtest replays VIX + SPY only (breadth replay is expensive: 50 stocks × N days). The classifier handles missing breadth gracefully — the strong-risk-on `aggressive` bump just doesn't fire in backtest.

**Mode-compare backtest** at `/dashboard/backtest/mode-compare?symbol=AAPL` runs the user-selectable comparable modes (`optimized` / `tactical` / `adaptive`; `tactical-smart` excluded as its active-management logic doesn't translate to backtesting) against the same symbol+date-range. Stats table + equity-curve overlay + adaptive's modeTimeline visualization. (v3.1 — pre-trim this ran 6 modes including conservative/moderate/aggressive; those are reachable via adaptive only and no longer shown standalone.)

## Congressional trades (official source)

`/dashboard/congress` and `/api/congress` read from the local `congressional_trades` table (migration `0031`), which is populated by the daily refresh cron from the official House Clerk bulk PTR archive at `disclosures-clerk.house.gov/public_disc/financial-pdfs/{YEAR}FD.ZIP`. Replaces the previous Finnhub `/stock/congressional-trading` integration that was moved to a paid tier in May 2026.

**Ingestion pipeline** (`src/lib/congress-house-ingester.ts`):
1. Fetch bulk ZIP (~80 KB)
2. Parse XML index (`fast-xml-parser`) → filter `FilingType="P"` (Periodic Transaction Report)
3. For each PTR, fetch PDF + extract text (`pdf-parse` v2 class API)
4. Strip NUL bytes from extracted text (PDF emits them around form-field markers)
5. Regex-extract transaction rows: `(OWNER)? ASSET (TICKER) [TYPE] {P|S|E} MM/DD/YYYY MM/DD/YYYY $X - $Y`
6. Filter out Treasury CUSIPs (`isLikelyStockTicker`)
7. Sanitize asset descriptions (`sanitizeAssetDescription` — strips form preamble + inter-row footer leakage)
8. Upsert with `ON CONFLICT DO NOTHING` against the unique constraint `(chamber, filer_name, transaction_date, ticker, transaction_type, amount_from)`

**Concurrency:** 5 PDFs in parallel with 250 ms pacing between batches. ~500 PTRs/year × ~3s avg ≈ 5 min per year.

**Cron:** `GET /api/cron/refresh-congress` (auth via `x-cron-secret` header against `CRON_SECRET` env). Pulls current year + (in Jan-Feb) prior year to cover late filings across the year boundary. Schedule daily at 6 AM ET via external scheduler (Cloudflare cron / GitHub Action / droplet crontab).

**Backfill:** `npx tsx scripts/backfill-congress.ts --years 2026,2025,2024`. Idempotent — re-running just skips duplicates.

**Senate ingester** (`src/lib/congress-senate-ingester.ts`) — Phase 2 shipped 2026-05-13. Lives behind `efdsearch.senate.gov` which requires:
1. GET `/search/home/` to get a `csrftoken` cookie + `csrfmiddlewaretoken` hidden field
2. POST `/search/home/` with `prohibition_agreement=1` + the token to establish the session
3. POST `/search/report/data/` with DataTables-style params + `report_type=11` (PTR) + date range → JSON listing of filings with UUIDs
4. GET `/search/view/ptr/{uuid}/` → HTML page with the transactions table

Parser uses `node-html-parser` against `<h2 class="filedReport">` (filer), `<h1>` (report date), `<tbody> <tr>` (transactions). Skips paper-filed PDFs (`/view/paper/` links — would need OCR) and rows where the Ticker column is `--` (municipal bonds, mutual funds without symbol). The site is fronted by Akamai which is aggressive about non-browser-shaped traffic; the ingester uses a realistic UA + standard browser headers and sequential per-PTR fetches with 500 ms pacing.

The cron and backfill script handle House + Senate independently — one failing doesn't tank the other. After both phases the unified UI at `/dashboard/congress` shows full Congressional coverage.

## AI Providers & System Configuration

**All AI flows go through Groq (`llama-3.3-70b-versatile`)** — Insights, Quick Insight widget, hybrid AI scoring + sentiment layers, filings chat, market digest, AI chat panel, and the Recent Trades **AI ✨** button. The single-Anthropic-route holdover at `summarize-trade` was migrated 2026-05-12; `@anthropic-ai/sdk` is no longer a dependency. The misleadingly-named `CLAUDE_CONFIG` in `src/lib/config.ts` is still the source of truth for `.model` + `.maxTokens` constants but no longer reads `.apiKey` directly — all key lookups go through `getLlmApiKey()` / `getFinnhubApiKey()` / `getAnthropicApiKey()` in `src/lib/system-config.ts`.

**Keys live in the `system_config` table** (migration `0030_system_config.sql`), encrypted with AES-256-GCM via `src/lib/crypto.ts`. Rotate from **/dashboard/admin/system-config** — no SSH required. Lookup order at runtime: 60s in-memory cache → DB → `process.env[<key>]` fallback. The env fallback is intentional so a fresh install boots cleanly before the admin has populated the DB.

**Audit:** every save emits a hash-chained `SYSTEM_CONFIG_UPDATED` audit row whose metadata records `{key, hadOldValue, valueLength}` — never the value itself.

**Test-before-save:** the admin UI's [Test] button calls `POST /api/admin/system-config/test` which hits the live provider with a 1-token ping using the candidate key. The candidate is not persisted; only [Save] writes.

**Known keys** (allow-list enforced in both API + helper): `GROQ_API_KEY`, `FINNHUB_API_KEY`, `ANTHROPIC_API_KEY`. Anything else is rejected — admins can't silently overwrite arbitrary env vars from the UI.

**Caveat — Finnhub:** the Finnhub client (`src/lib/finnhub.ts`) constructs once at process boot and reads its key field at that time. Rotating `FINNHUB_API_KEY` via the admin UI requires an app restart for the trading engine + per-symbol routes (news, sentiment, recommendations, fundamentals, etc.) to pick up the new value. The LLM path (`getLlmApiKey()`) is fully async and picks up changes on the next call after the 60s cache window.

## Security & Route Patterns

### Auth on Mutating Routes
All POST/PUT/PATCH/DELETE route handlers use `requireAuthWithCsrf(request)` from `@/lib/auth`:
```typescript
const auth = await requireAuthWithCsrf(request);
if (auth instanceof Response) return auth;
// auth is JWTPayload — use auth.userId, auth.email, etc.
```
Admin routes: `requireAuthWithCsrf(request, ["admin"])`. GET handlers use `getSession()`.

**Excluded from CSRF:** `auth/login`, `auth/register`, `auth/logout`, `csrf`, `cron/*`, trader-secret routes (`trader/pnl`, `trader/signals`, `trader/trades`).

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

### Standard page template:
```tsx
<div className="p-4 lg:p-6 space-y-6">
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Title</h1>
      <p className="text-sm text-text-secondary">Subtitle</p>
    </div>
    <Button>Action</Button>
  </div>
  {/* Content in Cards */}
</div>
```

### Responsive (mandatory):
- Page padding: `p-4 lg:p-6` (never bare `p-6`)
- Headers: `flex flex-col sm:flex-row` (stack on mobile)
- Grids: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (mobile-first)
- Side panels: `flex-col lg:flex-row` (never side-by-side below lg:)
- Tables: wrap in `overflow-x-auto`
- Button text: `<span className="hidden sm:inline">Full</span> Short`
- Form grids: `grid-cols-1 sm:grid-cols-2 gap-3`
- Form pages: constrain with `max-w-3xl`

### Table pattern:
```tsx
<div className="overflow-x-auto">
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b border-border text-text-muted text-left">
        <th className="pb-2 pr-4 font-medium">Col</th>
        <th className="pb-2 font-medium text-right">Number</th>
      </tr>
    </thead>
    <tbody className="font-mono">
      <tr className="border-b border-border/50">...</tr>
    </tbody>
  </table>
</div>
```

### Common patterns:
- Loading spinner: `border-2 border-accent/30 border-t-accent rounded-full animate-spin`
- P&L coloring: `className={val >= 0 ? "text-bullish" : "text-bearish"}`
- Edit mode banner: `bg-accent/10 border border-accent/20` with accent icon
- Success feedback: `text-bullish` + Check icon (auto-dismiss after 3s)
- Error display: `text-sm text-bearish`
- Empty state: EmptyState component or inline centered block with muted icon

## Dashboard Pages (62 total)
Located at `src/app/dashboard/*/page.tsx`:

**Core:** alerts, analysis, calculator, chat, screener, settings, trader
**Analysis & Market:** breadth, correlation, heatmap, multi-timeframe, relative-strength, risk-correlation, sector-rotation, unusual-activity
**Trading Tools:** backtest, replay, risk-simulator, strategies, strategy-builder, watchlists, **trade/[symbol]** (manual order ticket)
**Journal & Analytics:** drawdown, journal, performance, pnl-calendar, reports
**Research:** articles, education, education/guides, education/guides/[slug], education/review, filings, insights, news, sentiment, **congress**
**Macro:** calendar, currency, earnings, policy
**Community:** feed, forum, posts, leaderboard, **messages**, **messages/[id]**
**Help:** **support**, **support/[id]**
**Public (no auth):** `/terms`, `/risk`, `/w/[token]` (shared watchlist), `/dashboard/messages`

**Admin:** admin, **admin/audit**, **admin/system-config**, paper-trading, portfolio, tax, tax-center

### New API Routes
- `/api/multi-timeframe` — dual-timeframe (5m + 1d) analysis with confluence scoring
- `/api/breadth` — market breadth: advance/decline, % above SMA 50/200, avg RSI, sector breakdown
- `/api/sector-rotation` — rolling 1w/1m/3m sector performance with rotation phase classification (leading/weakening/lagging/improving)
- `/api/unusual-activity` — volume spike detection (2x+ 20-day avg) across tracked symbols
- `/api/education/progress` — per-user guide view + bookmark + quiz state (returns empty for anonymous)
- `/api/education/guides/[slug]/view` — POST upserts a view, bumps view_count
- `/api/education/guides/[slug]/bookmark` — POST/DELETE toggles bookmark
- `/api/education/guides/[slug]/quiz` — POST records quiz attempt; sets quiz_passed_at on first ≥80%
- `/api/education/review` — GET due-cards queue, POST a review with quality 0–5 (SM-2)
- `/api/tax-status` — GET/PUT user's self-attested Trader Tax Status + §475(f) MTM declaration
- `/api/portfolio/summary` — net-worth aggregation across paper portfolios + live broker positions

### 2026-05-12 — New API Routes (multi-watchlist + QoL + community)
- `/api/watchlists` (plural) — GET list, POST create. Multi-list CRUD on top of legacy `/api/watchlist` (which remains as the "act on default list" surface)
- `/api/watchlists/[id]` — GET fetch, PATCH rename/setDefault, DELETE (refuses last-list deletion, auto-promotes oldest survivor on default-delete)
- `/api/watchlists/[id]/items` — POST/DELETE symbols on a specific list
- `/api/watchlists/[id]/share` — POST generate/rotate token, DELETE revoke
- `/api/public/watchlist/[token]` — public read endpoint (no auth) backing `/w/[token]`
- `/api/dashboard/layout` — single default layout (Phase 20)
- `/api/dashboard/layouts` — multi-layout CRUD with rename/setDefault/delete
- `/api/dashboard/layouts/[id]` — GET fetch, PATCH update, DELETE
- `/api/broker/connections/[id]/activate` — atomic broker switcher, refuses while engine runs
- `/api/congress` — Congressional Periodic Transaction Reports (filings), optional `?symbol=`
- `/api/transcripts/[symbol]` — earnings-call metadata listing (paid-tier text deferred)
- `/api/performance/attribution` — realized $ P&L by symbol from `trader_trades`
- `/api/alerts/history` (DELETE) — bulk-clear caller's alert history
- `/api/me/digest-email` — GET/PATCH opt-in for daily digest email
- `/api/me/terms` — GET state, POST accept the current TERMS_VERSION
- `/api/support/tickets` — GET list, POST open new ticket
- `/api/support/tickets/[id]` — GET thread, POST reply, PATCH status/priority
- `/api/dm/threads` — GET list, POST start new
- `/api/dm/threads/[id]` — GET thread + auto-mark-read, POST reply

## Education Section

Located at `/dashboard/education` with three top-level tabs (Glossary | Guides | Calculators) plus dedicated routes for guides and spaced-repetition review.

### Content (all authored as typed TS data, not in DB)
- `src/lib/glossary-data.ts` — 95 glossary terms across 6 categories (`basics`, `technical`, `fundamental`, `options`, `risk`, `wealth`). Adding a term: append to `GLOSSARY_TERMS` array.
- `src/lib/education/guides-data.ts` — 14 long-form guides typed as `Guide` objects with `keyFacts` and `sections[]` of typed `GuideBlock`s (paragraph, heading, list, table, callout, key-value, calculator). Adding a guide: define a new `Guide` const, append to `GUIDES` array — slug becomes the route automatically.
- `src/lib/education/quizzes-data.ts` — 5-question quizzes per guide keyed by slug. Pass = ≥80%. Adding a quiz: add entry to `QUIZZES` map.
- `src/lib/education/spaced-repetition.ts` — pure SM-2 algorithm (`applyReview`, `initialState`); no I/O.
- `src/lib/education/guide-search.ts` — in-memory inverted index over guides for AI chat RAG (TF-IDF + query-term boosts; de-dupes by guide).

### Calculators (8)
Live in `src/components/education/calculators/*.tsx`. Registered in:
1. `GuideCalculator` union in `guides-data.ts`
2. `Block` switch in `src/components/education/guide-renderer.tsx`
3. The Calculators tab in `src/app/dashboard/education/page.tsx`

Adding a calculator: drop the component, then add to all three places.

### Cross-feature integrations
- **Tax Center** (`/dashboard/tax-center`) — `PersonalizedTaxEducation` ranks education links based on user data (harvestable losses, trade count, estimated tax, mixed gains). `TaxStatusCard` lets users self-attest §475(f) MTM via `/api/tax-status`.
- **Trader page** (`/dashboard/trader`) — `TraderTaxCallouts` reads `/api/portfolio/summary` + `/api/tax-status` to surface harvestable unrealized losses with MTM-aware messaging (no wash-sale concern under MTM).
- **AI Chat** (`/api/chat`) — `gatherChatContext()` calls `searchGuides(query, 3)` to inject relevant guide snippets into the system prompt with citation links (`/dashboard/education/guides/<slug>#<sectionId>`).
- **Dashboard widgets** — `NetWorthWidget` (aggregates portfolios + broker cache), `ContinueReadingWidget` (next education action via `useEducationProgress()`). Both registered in `src/lib/widget-registry.ts`.
- **Guide bodies** — `<GlossaryAwareText>` auto-wraps known terms in tooltip definitions inside paragraph/list/callout text. Multi-word terms match first; per-paragraph dedup.

### Database (3 tables, all in `src/lib/db/schema/education.ts`)
- `glossary_terms` + `education_progress` — legacy schema, kept for FK stability but unused by the v1+ routes
- `education_guide_views` — `(user_id, slug)` unique. View count, bookmark state, quiz state (`quiz_score`, `quiz_total`, `quiz_passed_at`, `quiz_attempts`). Slug is text — no FK to a guides table since guides live in TS.
- `glossary_review_state` — SM-2 per `(user_id, term_id)`. `ease_factor` stored as integer ×100.
- `user_tax_status` — one row per user. Self-attested TTS + MTM election year + free-form notes. Pure record-keeping; Sentinel does not file or validate.

### Migrations
- `0013_education_guide_views.sql` — guide view tracking
- `0014_education_guide_quiz.sql` — adds 4 quiz columns to `education_guide_views`
- `0015_education_review_and_tax_status.sql` — adds spaced-rep + tax-status tables

All idempotent (`IF NOT EXISTS`). Apply on prod as `postgres`:
```bash
scp drizzle/0015_*.sql deploy@<host>:/tmp/
ssh deploy@<host> "sudo -u postgres psql sentinel_db -v ON_ERROR_STOP=1 -f /tmp/0015_*.sql"
```

### Disclaimers
`<EducationalDisclaimer />` (full + compact variants) is on every guide top + footer, every calculator, the hub page, and the guides index. Tagged with `data-print-disclaimer` so it renders prominently in printed/PDF output. Tax Status modal also carries a strong "self-attestation only" warning.

### Tests
- `tests/unit/guide-search.test.ts` (13 tests) — RAG indexer
- `tests/unit/spaced-repetition.test.ts` (11 tests) — SM-2 algorithm

### Backtest Page
- **Strategy presets** are filtered to the 6 engine-runnable base modes (`conservative`, `moderate`, `aggressive`, `optimized`, `tactical`, `tactical-smart`) plus `adaptive` (7th, regime-driven), `custom`, and `auto`. The live-trader mode picker is filtered further to `USER_FACING_MODES` (optimized / tactical / tactical-smart / adaptive); the others remain in the backtest preset list for offline research.
- **Date-range mode**: `/api/backtest/[symbol]` accepts `startDate`/`endDate` (`YYYY-MM-DD`) in addition to `days`. Provider `fetchBars()` accepts an optional `endDate`; historical fetches (>24h in the past) bypass the disk cache. Daily bars only — Yahoo retains ~60 days of intraday history, so multi-year 5m backtests aren't possible without a paid feed.

### Sub-Navigation Groups
Pages are organized under sidebar nav items via `SUB_NAV` in `nav-config.ts`:
- **Analysis:** Analysis, Multi-TF, Heatmap, Breadth, Correlation, Risk, Relative Strength, Sector Rotation, Unusual Activity
- **Trader:** Live Trader, Strategies, Builder, Backtest, Replay, Optimizer, Alerts, Watchlists, Risk Sim, Calculator
- **Journal:** Journal, Performance, Reports, Drawdown, P&L Calendar, Tax Center, Tax Report
- **Research:** News, Sentiment, Articles, Filings, Insights, Congress, Education (hub with Glossary | Guides | Calculators tabs; Guides index at `/education/guides`, individual guide at `/education/guides/[slug]`, Spaced Review at `/education/review`)
- **Macro:** Calendar, Earnings, Currency, Policy
- **Community:** Feed, Forum, Posts, Leaderboard, Messages

---

## Changelog

Dated retrospectives of major rollouts (2026-05-12 through 2026-05-14) — covering multi-watchlist, manual trading, broker switching, support/DMs/ToS, journal v2, Reddit feed, tier enforcement + Stripe billing, plus the 6-phase marathon and beginner-friendliness audits — live in `docs/changelog.md`. Read it when investigating "when did X land" or "what changed in batch Y"; day-to-day work uses `git log`.

---

## Static HTML docs (served by Next.js public/)

User-facing HTML documentation lives in **`public/docs/`** (not the repo-root `docs/` folder which holds markdown):

- `public/docs/engine-ruleset.html` — trading engine internals (kept in sync with `docs/ENGINE_RULESET.md`)
- `public/docs/beacontry-features.html` — per-page/per-feature user training reference
- `public/docs/tiers.html` — full tier breakdown + feature matrix (~60 rows × 5 columns) + pricing FAQ
- `public/docs/usage-slides.html` — onboarding slides

These render as static assets at `/docs/*.html` on any deployment (Next.js auto-serves everything under `public/`). The repo-root `docs/` folder holds markdown source: `docs/ENGINE_RULESET.md`, `docs/future-ideas.md`, `docs/legal/licensing-and-acquisition.md`. **When editing the engine ruleset, change both `docs/ENGINE_RULESET.md` AND `public/docs/engine-ruleset.html` in the same commit** — they're intentionally mirrored.

## Detailed Design Reference
For exhaustive design tokens, component APIs, and page templates, see `.claude/skills/sentinel-redesign/references/`:
- `design-tokens.md` — every color, font, spacing, shadow, animation value
- `component-patterns.md` — all component usage with code examples
- `page-templates.md` — 5 page templates, all 46 pages, responsive checklist

Invoke `/sentinel-redesign` to activate the full redesign workflow.
