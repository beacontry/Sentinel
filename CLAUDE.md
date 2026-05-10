# Sentinel — Trading Intelligence Platform

## Tech Stack
- Next.js 15.3 + React 19 + TypeScript
- Tailwind CSS 4 (uses `@theme` block in globals.css, NOT tailwind.config.ts)
- Drizzle ORM + PostgreSQL
- Anthropic SDK for AI chat analysis
- Lucide React icons
- Lightweight Charts (TradingView) for charting
- Vitest for testing (186 tests across indicators, analyzer, validators, signal translator, rate-limiter, db-timeout, crypto, audit, engine-safeguards)
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

### Theme: Dark/Light mode with emerald-tinted neutrals
All tokens defined in `src/app/globals.css` `@theme` block. Light mode is the default. Dark mode activates via `html.dark` class which overrides all color variables in `@layer base`.

**ThemeProvider** (`src/components/theme-provider.tsx`): wraps root layout, persists preference to `localStorage("sentinel-theme")`, toggles `dark` class on `<html>`, updates PWA `theme-color` meta tag. Use `useTheme()` hook for `{ theme, toggleTheme }`.

**Toggle locations:** Landing page navbar (Sun/Moon icon), dashboard sidebar footer ("Light Mode"/"Dark Mode" button).

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

Registration is **invite-only**. No public signup.

**Flow:** Admin sends invite from dashboard (`/dashboard/admin`) → user receives email with signup link (`/register?token=...`) → register page validates token, pre-fills email → account created, invite marked used.

**Key files:**
- `src/lib/db/schema/invites.ts` — `invites` table (token, email, expiry, used)
- `src/app/api/admin/invites/route.ts` — GET (list), POST (create + send email)
- `src/app/api/auth/validate-invite/route.ts` — GET (check token validity)
- `src/app/api/auth/register/route.ts` — requires valid invite token, email must match
- `src/app/register/page.tsx` — shows "Invite Required" without token, validates token on mount

**Admin UI:** Invitations section on admin page — email input to send invites, table of sent invites with status (Pending/Registered/Expired), copy link button.

### Email delivery (Resend)

Invite and alert emails are sent through **[Resend](https://resend.com)** via `src/lib/email.ts`. Two helpers: `sendInviteEmail(to, signupUrl)` and `sendAlertEmail(to, subject, body)`. Both branded HTML templates inlined in the same file.

**Required env vars** (`/opt/apps/sentinel/.env` on prod):
```bash
RESEND_API_KEY=re_...                                        # Sending-only API key from Resend → API Keys
EMAIL_FROM=Sentinel <noreply@guardcybersolutionsllc.com>     # Must use a Resend-verified domain
```

**Graceful fallback** — if `RESEND_API_KEY` is missing, both helpers log `"Email not configured"` and return `{ success: false }`. The invite route still creates the DB record and returns the signup URL so admins can copy/paste the link manually. **Never throws**, so the app stays usable when email is mis-configured.

**Verified domain** — the apex `guardcybersolutionsllc.com` is verified in Resend (shared across all GuardCyber apps). DKIM signs as `d=guardcybersolutionsllc.com` so the strict DMARC (`p=reject; adkim=s`) on the apex is satisfied. SPF lives on the `send.<domain>` envelope subdomain, but DMARC alignment is satisfied via DKIM regardless. **No per-app DNS work** is needed for new tenants — only a `RESEND_API_KEY` and `EMAIL_FROM` env var.

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
     ghcr.io/ixiondt/sentinel:latest
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

Live trading is gated behind `ALLOW_LIVE_TRADING=1` in the server environment. Without it, the engine refuses to start on any broker connection where `environment="live"` and emits an `engine.live_blocked` audit event. Paper connections are unaffected.

**Going live (one-time setup):**
1. Tighten risk profile on Trader page first — recommend `maxPositionPct` 2–5%, `maxDailyLossPct` 1%, `maxDailyNotionalPct` 0.5 (50% of equity), `maxConsecutiveLosses` 3.
2. Settings → Broker Connections → Add → environment = Live → paste live API keys → type "LIVE" to confirm → Save. Test before saving.
3. On the droplet:
   ```bash
   echo 'ALLOW_LIVE_TRADING=1' | sudo tee -a /opt/apps/sentinel/.env
   # podman restart does NOT re-read .env — must stop+rm+run
   ssh deploy@<host> 'sudo podman stop sentinel-app && sudo podman rm sentinel-app && \
     sudo podman run -d --name sentinel-app --network=host \
     --env-file /opt/apps/sentinel/.env \
     -e NODE_ENV=production -e HOSTNAME=0.0.0.0 -e PORT=3010 \
     -e NEXT_TELEMETRY_DISABLED=1 -e CACHE_DIR=/data/cache \
     -v /opt/apps/sentinel/cache:/data/cache:Z \
     --restart always -m 2g \
     ghcr.io/ixiondt/sentinel:latest'
   ```
4. Trader page → Start. Watch the persistent red LIVE banner appear. First scan should populate audit log with `engine.started` (metadata.environment = "live") and the boot equity snapshot.
5. Monitor the **Audit Log** page (`/dashboard/admin/audit`) on first session — every order, halt, and rejection is logged with hash chain.

**Safeguards active on every live engine** (independent of risk profile):
- Account-switch detection: halt if `account_number` changes mid-session OR equity drops > 50% from boot snapshot.
- Broker auto-halt: 5 consecutive `getPositions()` failures → halt (was log-only before).
- Order rate limit: 30 orders / 60s sliding window per engine — defense against signal-storm bugs.
- Daily notional cap: rejects BUYs that would exceed `maxDailyNotionalPct × bootEquity` (cumulative across the day).
- Consecutive-loss halt: tracks losing trades since last winner; halts at threshold.

All halts emit `engine.halted` audit events with `metadata.reason ∈ {broker_unreachable, account_mismatch, equity_collapse, consecutive_losses, user_requested_flatten_all}`.

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

## Dashboard Pages (47 total)
Located at `src/app/dashboard/*/page.tsx`:

**Core:** alerts, analysis, calculator, chat, screener, settings, trader
**Analysis & Market:** breadth, correlation, heatmap, multi-timeframe, relative-strength, risk-correlation, sector-rotation, unusual-activity
**Trading Tools:** backtest, replay, risk-simulator, strategies, strategy-builder, watchlists
**Journal & Analytics:** drawdown, journal, performance, pnl-calendar, reports
**Research:** articles, education, education/guides, education/guides/[slug], education/review, filings, insights, news, sentiment
**Macro:** calendar, currency, earnings, policy
**Community:** feed, forum, posts
**Admin:** admin, paper-trading, portfolio, tax, tax-center

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
- **Strategy presets** are filtered to the 7 engine-runnable modes (`conservative`, `moderate`, `aggressive`, `optimized`, `intraday`, `tactical`, `tactical-smart`) plus `custom` and `auto` — backtest and Live Trader share the same preset universe so what you tune is what you can deploy.
- **Date-range mode**: `/api/backtest/[symbol]` accepts `startDate`/`endDate` (`YYYY-MM-DD`) in addition to `days`. Provider `fetchBars()` accepts an optional `endDate`; historical fetches (>24h in the past) bypass the disk cache. Daily bars only — Yahoo retains ~60 days of intraday history, so multi-year 5m backtests aren't possible without a paid feed.

### Sub-Navigation Groups
Pages are organized under sidebar nav items via `SUB_NAV` in `nav-config.ts`:
- **Analysis:** Analysis, Multi-TF, Heatmap, Breadth, Correlation, Risk, Relative Strength, Sector Rotation, Unusual Activity
- **Trader:** Live Trader, Strategies, Builder, Backtest, Replay, Optimizer, Alerts, Watchlists, Risk Sim, Calculator
- **Journal:** Journal, Performance, Reports, Drawdown, P&L Calendar, Tax Center, Tax Report
- **Research:** News, Sentiment, Articles, Filings, Insights, Education (hub with Glossary | Guides | Calculators tabs; Guides index at `/education/guides`, individual guide at `/education/guides/[slug]`, Spaced Review at `/education/review`)
- **Macro:** Calendar, Earnings, Currency, Policy

## Detailed Design Reference
For exhaustive design tokens, component APIs, and page templates, see `.claude/skills/sentinel-redesign/references/`:
- `design-tokens.md` — every color, font, spacing, shadow, animation value
- `component-patterns.md` — all component usage with code examples
- `page-templates.md` — 5 page templates, all 46 pages, responsive checklist

Invoke `/sentinel-redesign` to activate the full redesign workflow.
