# Sentinel Changelog

Dated retrospectives extracted from CLAUDE.md. Day-to-day "when did X land" questions are better answered by `git log` — these entries are kept for the narrative context that doesn't fit in commit messages.

---

## 2026-05-12 — Multi-watchlist + Dashboard layouts (Phase 20 + A/B)

### Multi-watchlist (DB-backed, replaces localStorage workspaces)
Users can own multiple named watchlists. Migration `0023_multi_watchlist.sql` adds a `watchlists` table (one row per named list, `isDefault` flag) and a `watchlistId` FK on `watchlist_items`. Default-invariant enforced both by a partial unique index (`watchlists_user_default_uniq`) and by every CREATE/PATCH transaction (demote prior default first).

**Shared helpers in `src/lib/watchlists.ts`:**
- `getOrCreateDefaultWatchlistId(userId)` — race-safe; mutating callers use this
- `resolveActiveWatchlistId(userId, hint?)` — read-only resolver, falls back to user's default

**Legacy `/api/watchlist`** still works as the "default list" surface — every existing widget, page, and consumer keeps working unchanged. New code that needs to scope to a specific list uses `/api/watchlists/[id]/items`.

**Sharing:** Migration `0025` adds `watchlists.share_token`. POST `/api/watchlists/[id]/share` generates a 24-byte hex token; `/w/[token]` renders a public read-only view (no auth).

### Dashboard widget layouts (Phase 20)
`dashboard_layouts` table already supported `name + isDefault`. Phase 20 extended `layout_data.widgets` from `string[]` (legacy) to `{id, size?}[]` so each widget can override its size (sm/md/lg/full). Backward-compat: legacy arrays are coerced on read.

Endpoints: singular `/api/dashboard/layout` (default list) + plural `/api/dashboard/layouts` for multi-layout CRUD. LayoutSwitcher in the dashboard header lets users save / rename / delete / switch.

---

## 2026-05-12 — Manual trading + broker switching

### Manual order ticket (`/dashboard/trade/[symbol]`)
- BUY/SELL toggle, market/limit/stop/stop-limit types, day/gtc/ioc/fok TIF
- **Bracket orders** (atomic entry + stop-loss + take-profit) — share-mode + BUY only
- **Fractional shares / dollar-based buys** — `notional` mode (Alpaca only; Tradier/IBKR reject with a clear BrokerError). Constrained to market + day/ioc by the validator
- **Engine-gated**: refused while the user's engine is running (both UI banner + API 409 `ENGINE_RUNNING`). Prevents the engine's in-memory position map from drifting from the broker
- **Live-account confirmation**: `confirm()` prompt before submission when the active connection is `environment="live"`
- Reachable from the Analysis page sidebar (Trade button alongside Refresh) and via Cmd+K (typing a ticker shows "Trade {SYM}")

### Broker switcher (sidebar)
- Sits below the sidebar logo on both desktop + mobile
- Single-connection users see a static label (broker + env); multi-connection users see a dropdown
- Switching is atomic (`POST /api/broker/connections/[id]/activate` — demote others + promote one in one transaction)
- **Engine-gated**: refused while engine running (same rationale as manual ticket); UI surfaces a yellow banner inside the dropdown
- LIVE option shows a confirm() prompt with the broker name

### PlaceOrderParams (`src/lib/brokers.ts`)
- `qty` and `notional` are now both optional (exactly one required)
- Alpaca client: routes to `notional` payload when `params.notional` is set, else `qty`
- Tradier + IBKR: throw `BrokerError("not supported")` if `notional` is passed
- Bracket params (`orderClass: "bracket"`, `takeProfitPrice`, `stopLossPrice`) flow through `placeBrokerOrderSchema`

---

## 2026-05-12 — Display preferences (DisplayPrefsProvider)

Client-side, localStorage-backed preferences applied across the app. Cross-tab sync via the `storage` event. Mounted in `/dashboard/layout.tsx`.

**Provider state:**
- `pnlFormat: "dollar" | "percent" | "both"` — sidebar button cycles. Use `formatPnl(amount, basis, format)` helper everywhere a P&L is displayed
- `timeFormat: "12h" | "24h"` — `formatTime` / `formatDateTime` helpers
- `colorBlindMode: boolean` — toggles `html.colorblind` class. globals.css overrides `--color-bullish` / `--color-bearish` to a Wong-palette blue/orange when set
- `landingPage` — which dashboard route to land on after login. Login page reads directly from localStorage (it's outside the provider tree)

Settings page has a "Display preferences" card exposing all four toggles + the daily-digest email opt-in.

---

## 2026-05-12 — News, performance, charting, congress

### News sentiment badges
`src/lib/headline-sentiment.ts` exports a keyword-based `scoreHeadline()` (50 bullish terms + 55 bearish, including multi-word phrases). `/api/news/feed` tags each article with `sentiment: "bullish" | "bearish" | "neutral"`. News page shows a colored ▲ Bullish / ▼ Bearish badge inline — not a substitute for the hybrid sentiment-layer (which feeds signal math), just a fast directional hint.

### Performance attribution
`/api/performance/attribution` aggregates filled SELL + manual_close `trader_trades` rows per symbol. Performance page renders top-10 contributors with proportional bars + per-symbol $ + % of total. Different from the bySymbol accuracy table — answers "where did my dollars come from?"

### TradingView Advanced Chart
`src/components/dashboard/tradingview-chart.tsx` wraps TradingView's free embedded widget. Analysis page toggles between "Engine view" (lightweight-charts with signal/earnings markers) and "TradingView" (full widget with drawing tools). Choice persists per-device in `sentinel-chart-mode` localStorage key. CSP allows `s3.tradingview.com` script-src + `*.tradingview.com` img/connect + `frame-src` for the iframe.

### Congress trading page (`/dashboard/congress`)
Federal Periodic Transaction Reports from Finnhub's `/stock/congressional-trading`. Free Finnhub tier covers this. Page: filters by ticker (server query), member name (client filter), chamber, direction. Each row links to `/dashboard/analysis` + `/dashboard/trade/[symbol]`.

### Earnings call transcripts (`/api/transcripts/[symbol]`)
Listing endpoint only (year/quarter/date/Finnhub id) — full transcript text + AI summarization are gated behind Finnhub's paid alternative-data tier (parked in `docs/future-ideas.md`). Surfaced as the "Calls" tab on Analysis intelligence.

---

## 2026-05-12 — Backtest metrics (Sortino / Calmar / MAR)

`src/lib/backtester.ts` now computes three additional risk-adjusted return metrics alongside the existing Sharpe + max drawdown:
- **sortinoRatio** = excess return ÷ stdev(negative-only returns) × √252
- **calmarRatio** = annualizedReturn ÷ maxDrawdown
- **marRatio** = totalReturn ÷ maxDrawdown (whole window, no annualization)

Sharpe penalizes upside volatility the same as downside, which is silly for trading strategies — Sortino/Calmar/MAR give a more honest read on "how painful was this to hold." Backtest UI shows them in a second 3-tile row below the original 6-tile grid with a one-line legend.

---

## 2026-05-12 — Customer support + ToS click-through + DMs

### Customer support ticketing (`/dashboard/support`)
Tables: `support_tickets`, `support_messages` (migration `0027`). Users open tickets; admins reply. Status flow: open → responded → resolved → closed. Admins see all tickets; users see only their own. Email notifications via Resend on every message (admin notified on new ticket + user reply; user notified on admin reply).

### Terms of Service + Risk Disclosure
Click-through acceptance modal blocks the dashboard until the user agrees. `TERMS_VERSION` in `src/lib/terms-version.ts` is a date-stamp string ("2026-05-12") — bumping it forces every user to re-accept on next dashboard load. Public pages at `/terms` and `/risk`. Migration `0026` adds `users.terms_accepted_at` + `users.terms_accepted_version`. Each acceptance writes a tamper-evident audit row (`USER_PROFILE_UPDATED`) with the version.

### Private DMs (`/dashboard/messages`)
Tables: `dm_threads` (sorted user pair, unique index), `dm_messages` (migration `0028`). Per-side `a_last_seen_at` / `b_last_seen_at` powers the unread badge without a separate read-state table. Inbox + chat-style threaded conversation. Enter sends; Shift+Enter for newline.

---

## 2026-05-12 — Daily digest email (opt-in)

The market-digest cron has been generating an AI summary and fanning out to Discord + PWA push since Phase 9. Email delivery added as a third channel, strictly opt-in. Migration `0024` adds `users.digest_email_opt_in` (default false). `/api/me/digest-email` exposes GET/PATCH; toggle lives on the Settings → Display preferences card. Delivery address is `notification_email` when set, else `email`.

---

## 2026-05-12 — Engine-gated operations

Two operations are now refused while the engine is running, with a 409 `ENGINE_RUNNING` API response + matching UI banner:
1. Manual order placement (`POST /api/broker/orders`)
2. Broker connection switching (`POST /api/broker/connections/[id]/activate`)

Both checks call `peekEngineStatus(userId)`. Rationale: the engine maintains an in-memory `positionMap` that lags the broker by up to one scan interval. Concurrent manual orders or broker switches can silently drift state.

---

## 2026-05-12 — Component library additions

- `<SymbolLink symbol="AAPL" to?="analysis"|"trade" />` — single source of truth for clickable tickers. Replaces 100+ scattered `<span className="font-mono">{symbol}</span>` spots
- `<PositionDetailSheet symbol position signals engineRunning onClose onClosePosition />` — right-anchored slide-in drawer for position drill-down (entry, current, P&L, signal history, Chart/Trade/Close actions)
- `<DisplayPrefsProvider>` + `useDisplayPrefs()` — global formatting context
- `<TermsAcceptanceModal>` — non-dismissible click-through, mounted in dashboard layout
- `<BrokerSwitcher>` + `<PnlFormatToggle>` — sidebar controls
- `<TradingViewChart symbol interval height>` — embedded widget
- `<KeyboardShortcuts>` — global single-key shortcuts (T/A/S/W/J/N + ? for help)

---

## 2026-05-12 (later) — Bug fixes worth remembering

### Trader: Open Positions Stop column was a UI lie
The trailing-stop logic in `syncBrokerStops()` correctly ratchets up the resting Alpaca stop every scan as positions climb, but it never wrote the new value back into `pos.stopLoss` (the in-memory field the dashboard reads). Result: positions could be up +36% with the broker stop trailing at peak × 0.98, while the UI's Stop column still displayed the entry-time disaster value (entry × 0.9033).

Fix in commit `00131db`:
1. `syncBrokerStops()` now writes `pos.stopLoss = targetStop` after every successful broker place/replace. Also reconciles the other way: if the existing broker stop > pos.stopLoss (e.g. after a server restart), it lifts memory to match.
2. Dashboard route also reads the actual resting broker stops via the open-orders feed and renders `Math.max(broker, tracked.stopLoss)` as the effective stop — belt-and-suspenders so the table can never display a value lower than what's actually resting.

When debugging future "displayed value looks wrong" reports, check **both** the in-memory `positionMap` AND the broker's open-orders list — they can drift. See `docs/future-ideas.md § UI-lie bug audit` for the catalog of other suspected-drift surfaces.

### Analysis page now respects ?symbol= deep links
Deep-links like `/dashboard/analysis?symbol=HPE` now actually load HPE. Previously the page only read symbols from the user's watchlist and auto-selected `symbols[0]`, ignoring the URL. Commit `647c1bb` adds a `useSearchParams()` read + auto-analyze for non-watchlist symbols + pushRecent.

Used by: Cmd+K symbol jump, congress trade rows, performance attribution rows, every `<SymbolLink>` in the app.

### Next.js 15 build-time gotcha: useSearchParams needs Suspense
The Analysis-page deep-link fix broke prerendering (`⨯ useSearchParams() should be wrapped in a suspense boundary`). The hook opts the route out of static SSR; Next.js 15's prerenderer requires `<Suspense>` so the SSR shell can render while the client hydrates.

Pattern (commit `d6bd8ef`):

```tsx
export default function Page() {
  return (
    <Suspense fallback={<Spinner />}>
      <InnerComponent />
    </Suspense>
  );
}

function InnerComponent() {
  const searchParams = useSearchParams();
  // …
}
```

**`tsc --noEmit` does not catch this.** Always run a real `next build` locally when adding `useSearchParams()`, `useParams()`, or any other client-only hook to a route that's currently static. The CI build is the safety net but a local build catches it before the push.

---

## 2026-05-13 — Migrations summary (0032)

Just one migration this batch:

| # | File | What |
|---|------|------|
| 0032 | `journal_v2.sql` | `trade_journal.type` (default 'manual'), `trade_journal.prompt_date` (nullable date), `journal_auto_trade_uniq` partial unique index on (user_id, trader_trade_id) WHERE type='auto-trade', `journal_prompt_uniq` partial unique index on (user_id, type, prompt_date) WHERE prompt_date IS NOT NULL, `journal_type_idx`. Idempotent. Phase 1 (auto-stub on filled trades) + Phase 2 (daily pre/post-market prompts) both rely on these. |

Apply on prod as `postgres`:
```bash
scp drizzle/0032_journal_v2.sql deploy@<host>:/tmp/
ssh deploy@<host> "sudo -u postgres psql sentinel_db -v ON_ERROR_STOP=1 -f /tmp/0032_journal_v2.sql"
```

Cron schedule additions (droplet crontab, UTC):
```
# Journal v2 phase 2 — daily prompts
0 12 * * 1-5 curl -fsS -H "x-cron-secret: $CRON_SECRET" https://beacontry.com/api/cron/journal-prompts?type=pre-market
0 20 * * 1-5 curl -fsS -H "x-cron-secret: $CRON_SECRET" https://beacontry.com/api/cron/journal-prompts?type=post-market
```
(12:30 UTC = 8:30 ET / 20:30 UTC = 4:30 ET during EDT; shift one hour in EST.)

## 2026-05-12 — Migrations summary (0023–0029)

All idempotent. Apply on prod as `postgres` (chmod-700 droplet means app user can't `ALTER TABLE`).

| # | File | What |
|---|------|------|
| 0023 | `multi_watchlist.sql` | `watchlists` table + `watchlist_items.watchlist_id` FK + backfill + partial unique on default |
| 0024 | `digest_email_opt_in.sql` | `users.digest_email_opt_in` |
| 0025 | `watchlist_share_token.sql` | `watchlists.share_token` + partial unique |
| 0026 | `terms_acceptance.sql` | `users.terms_accepted_at` + `users.terms_accepted_version` |
| 0027 | `support_tickets.sql` | `support_tickets` + `support_messages` |
| 0028 | `direct_messages.sql` | `dm_threads` (sorted pair, CHECK constraint) + `dm_messages` |
| 0029 | `engine_intelligence.sql` | `user_risk_profiles.max_sector_exposure_pct` + `adaptive_mode_enabled` + `earnings_blackout_days` |

---

## 2026-05-12 (final) — 6-phase marathon retrospective

Worked through the parked items from the UI-lie audit + QoL bigger asks across 6 phases. Net shipped:

**Phase 1 — Money bugs from UI-lie audit (commit `2775f7e`).**
- `canPlaceBuyOrder()` is now async + takes a fresh `account` snapshot. Awaits `maybeRefreshWashSaleSet()` before the wash-sale check; re-runs `evaluatePdtState(engine, account)` before the PDT check. A 2nd day-trade in a 15-min window or a same-scan losing-close-then-re-entry now correctly evaluates against live state.
- `bootEquity` re-snapshots at every new trading day across all 3 scan paths (intraday, tactical, main). 50% equity-collapse tripwire stays calibrated as the account grows organically.
- `tripSafeguardHalt()` writes `halted=true` to `trader_daily_pnl` immediately (fire-and-forget) so the dashboard reflects halts on the next fetch instead of waiting for the next scan boundary.
- Dashboard `todayPnl` response carries `source: "broker_intraday" | "broker_total" | "db_snapshot"` + `staleSeconds` so the UI can render a "stale" indicator instead of silently mixing broker intraday with DB snapshot.

**Phase 2 — Frozen-value cleanup (commit `4baa731`).**
`syncPositionMapFromBroker()` now resets `pos.peakPrice = currentPrice` when broker qty drops > 5% (partial close — trail recalibrates from the post-close size). Re-resolves `pos.trailingStopPct` and `pos.takeProfit` from the current strategy on every sync, so Strategies-page edits propagate to existing positions.

**Phase 3 — Cache invalidation (commit `cd8cd86`).**
- `FILTER_CACHE_TTL_MS = 6h` added on top of the existing day-string check for earnings + sentiment caches. Server-boot-at-3am-ET no longer means 20+ hours of stale data.
- Screener cache adds `scanStartedAt: Date | null`. `/api/screener` exposes both `scannedAt` (completed) and `scanStartedAt` (in-flight). Same field added to `EngineState` and surfaced through `peekEngineStatus()`.

**Phase 4 — Engine intelligence, 3 of 5 (commit `1019071`).**
Migration `0029` adds 3 columns to `user_risk_profiles`. `RiskLimits` expanded with `maxSectorExposurePct` / `adaptiveModeEnabled` / `earningsBlackoutDays`.
- **Sector exposure cap** — `canPlaceBuyOrder` takes optional `sectorExposureContext` (live position market values keyed by symbol) and refuses BUYs that would push a sector over cap × equity. New `buildSectorExposureContext()` helper. `TrackedPosition` now carries `currentPrice` + `marketValue` synced from broker so the cap check is in-memory.
- **Earnings blackout** — calls the existing `isInEarningsBlackout()` when the column is set.
- **P&L heatmap widget** — new `pnl-heatmap-widget` registered. Reads `/api/performance/attribution` (already exists). Top-5 contributors with proportional bars.
- Adaptive mode + dry-run mode deferred (need 60-day paper validation + dedicated design respectively).

**Phase 5 — Compare strategies (commit `1b8652d`).**
- `/dashboard/backtest/compare?ids=…` — pick up to 5 saved strategies (URL-driven for shareability), see stats columns (Return / Win Rate / Trades / Max DD / Sharpe / Sortino / Calmar / MAR) and an inline SVG equity-curve overlay (normalized to start = 100 so different starting balances are visually comparable).
- New `/api/backtest/compare?ids=…` endpoint.
- "Compare strategies" button on the existing Saved Strategies card (appears when 2+ saved).
- Mean reversion + divergence tracker deferred.

**Phase 6 — Frontend bigger asks, 4 of 5 (commit `190ea92`).**
- `/dashboard/portfolio` is no longer a redirect — full overview page aggregating manual + broker positions, sector allocation bars, top winners/losers.
- `/api/quotes?symbols=…` batch endpoint — last price + intraday change in one round-trip, 100-symbol cap, 60s response cache.
- Trader page Open Positions + Open Orders wrap in `grid-cols-1 2xl:grid-cols-2` for wide-screen 2-col layout.
- Cross-device recently-viewed sync deferred (localStorage is fine until multi-device usage picks up).

### Total churn this marathon

6 phases × ~1 commit each + the docs commit = ~7 commits, ~3 hours real time. All 6 phases ship behind feature flags or are additive (no behavior changes to existing flows except where bugs were fixed). The pending items in each phase are documented in `docs/future-ideas.md` with retrospective notes pointing to commit SHAs.

If anything regresses, individual phase commits revert cleanly.

## 2026-05-13 — UX consolidation + bug fixes (multi-commit batch)

Pre-existing bugs + UX cleanups discovered while reviewing the dashboard with the user.

### Real bugs fixed
- **CSRF: PIN setup 403** (`10a2c18`). `SKIP_PATHS = ["/api/auth/", "/api/csrf"]` in `src/components/csrf-init.tsx` was a substring-match list, silently exempting `/api/auth/set-pin` (a mutating route that DOES require CSRF) along with the genuinely-exempt login/register/logout. Narrowed to an explicit allow-list. Belt: `pin-setup-banner.tsx` now pre-warms `/api/csrf` on form expand + has its own explicit 403 retry, and translates the technical error into a user-actionable message. Drop `/api/csrf` from the 401-redirect skip too — a 401 there is the canonical session-expired signal.
- **CSRF audit follow-ups** (`8304ecb`). Switched `pathIsCsrfExempt` from `.includes()` to URL pathname parsing + `Set.has(pathname)` so future routes can't be accidentally exempted by substring overlap. Standardized `csrf-token` cookie `secure` to `FORCE_HTTPS` to match `sentinel-session` (was `NODE_ENV === "production"` — could diverge if env vars were forgotten).
- **Engine: duplicate-order from overlapping scan ticks** (`11012c3`). Bare `setInterval(() => scanFn().catch())` had no re-entrancy guard. A slow scan let the next tick fire while still in-flight; both concurrent scans called `client.getOrders()` independently and both got an empty-or-stale `pendingBuySymbols` (Alpaca has hundreds-of-ms eventual consistency on the orders endpoint), so the duplicate-buy guard went blind. User saw two SNDK buys at the same price/qty/age. Fix: closure-local in-flight flag with `.finally()` clear + 10-min stale-flag watchdog so a crashed scan can't wedge the scheduler. Same guard added to the 1-minute exit-check interval. Also: `getOrders` failures previously silently swallowed → now log warn + abort the BUY portion of the scan (better to skip than fire blind).
- **Performance page one-shot fetch** (`d79acff`). Wrapped in `usePolling` with `dashboardRefresh` (60s) so data refreshes as new trades close.
- **Education: 3 calculators on disk but unimported** (`9075cf6`). `compound-interest`, `fire-number`, `quarterly-tax-estimator` existed but weren't wired into the Calculators tab. All 8 now present.

### UX consolidation
- **5 themes** (`6e67c04`). See Design System § Theme above. Coral / light-blue / gray added to original light/dark. Theme picker replaces the binary toggle.
- **Earnings ticker discoverability** (`c3b04ac`). Promoted the "Add symbol" affordance with icon + heading + explanatory text + accent border when watchlist is empty. Adding now actually POSTs to `/api/watchlist` (persistent) instead of just merging in-memory for one query. Enter-to-submit. Toast on result.
- **Smart back button** (`6c783da`). New `<SmartBackButton fallbackHref>` in `src/components/ui/`. Uses `router.back()` when there's same-origin history, falls back to the explicit href for direct-link arrivals. Applied to `/dashboard/trade/[symbol]` (the reported case where Congress → Trade → back went to Analysis instead of Congress). Other detail pages (articles, messages, support, forum, posts) can adopt this incrementally — one-line change per page.
- **Analysis page: focus mode + chart fullscreen** (`32e2201`). Two related additions:
  - **Focus mode**: header toggle adds `html.focus-mode` which collapses the dashboard sidebar (CSS rule on `aside[data-app-sidebar]`). Persists per-device. Auto-cleans on page unmount so the sidebar isn't globally hidden when navigating away.
  - **Chart fullscreen**: new `<ChartFullscreenOverlay>` component (`src/components/ui/chart-fullscreen-overlay.tsx`). Maximize icon in the chart-mode toolbar opens a fixed-position overlay covering the viewport. Works for both Engine view (PriceChart) and TradingView. Esc + Exit button to close; body scroll locked while open. `TradingViewChart` accepts `height="fill"` for the overlay case.
- **Education calculators: accordion** (`9075cf6`). Was an always-expanded stack. Now click-to-expand, one open at a time. `CALCULATOR_REGISTRY` array drives the UI — add new calculators by appending one entry.
- **Articles auto-populate** (`a640287`). Articles page was empty because nothing was seeding it. Hooked into the existing market-digest cron — after persisting the digest + sending Discord/email, it now also inserts an article (slug = `market-digest-{YYYY-MM-DD}`, idempotent via unique slug index, author = first admin user, body prefixed with "Sentinel Daily Desk · {date}"). Empty-state copy on `/dashboard/articles` updated to say articles appear daily.
- **Live news feed widget** (`1f48b9e`). New registerable widget `live-news-feed`. Auto-refreshes via `usePolling` (newsRefresh = 5 min), shows 15 items with scroll overflow, sentiment indicator (bullish ▲ / bearish ▼ / neutral) per item, watchlist symbols first. Users add it via Dashboard → Edit Layout. Sits naturally as a right-column anchor on wide screens, fulfilling the user's "scrolling newsfeed on the right" request without forcing it on everyone.

### Follow-on commits (same-day, "keep going" pass)

- **SmartBackButton rollout** (`ca12ebd`) — applied SmartBackButton to articles/[slug], messages/[id], support/[id], forum/[threadId], posts/[postId]. Browser-back returns the user to wherever they came from (Cmd+K jump, notification click, feed link); direct-link arrivals still get the section index as fallback.
- **Chart fullscreen extended** (`675560a`) — applied to `/dashboard/replay` (lightweight-charts price+markers) and `/dashboard/backtest` (equity curve). Same Maximize2 / Minimize2 pattern. Esc closes; body scroll locked. `BacktestChart` extended with `height?: number | "fill"` so the ResizeObserver tracks both dimensions when filling a parent.
- **Dashboard crash + CSP** (`b5d4124`) — `PositionsWidget` was reading `pos.averageCost` / `pos.marketPrice` but `/api/trader/dashboard` returns `entryPrice` / `currentPrice`. `undefined.toFixed()` crashed the whole dashboard mid-widget-rearrange. Fixed the field-name mismatch + defaulted all numeric fields to 0 for partial-API-shape safety. Also added `static.cloudflareinsights.com` to CSP `connect-src` (was listed without the static subdomain, blocking the beacon-loader fetch).
- **Journal v2 phase 1: auto-stub on filled trades** (`69c5482`). Migration `0032_journal_v2.sql` (idempotent) adds `trade_journal.type` + `prompt_date` columns and two partial unique indexes — `journal_auto_trade_uniq` on (user_id, trader_trade_id) where type='auto-trade' (one stub per trade), and `journal_prompt_uniq` on (user_id, type, prompt_date) (one prompt per type/day, used by phase 2). New `src/lib/journal-auto-stub.ts::createAutoJournalStub()` called from `reconcilePendingTrades()` when a trade transitions PENDING → FILLED. Stub is markdown-formatted with the trade mechanics + leading questions ("Why am I taking this trade?" for entries, "What's the lesson?" for exits). Never throws (logs and returns); idempotent via the unique index.
- **Unusual Activity ticker click → quick-info drawer** (`6cb0e07`) — New `<SymbolPreviewSheet>` in `src/components/ui/`. Lightweight cousin of `<PositionDetailSheet>`. Opens on ticker click in `/dashboard/unusual-activity` (rows are now cursor-pointer + accent symbol color); shows price + intraday %, current signal with confidence, RSI/volume/SMA stats, sector. Three escape hatches: View full analysis, Trade, Add to watchlist. Reusable on any page with a ticker list.
- **Analysis layout rewrite** (`890b9f1`) — biggest change of the batch:
  - **Signals panel removed** (user picked Option A from the redundancy discussion). Left column is now pure watchlist.
  - **react-resizable-panels v4** drives the desktop layout. Three drag handles: left↔center, center↔right, and chart↔intelligence (vertical) inside the center column. Sizes persist per-device via `id` props on each Group. Mobile (lg:hidden) untouched.
  - **Empty space fixed.** Both `<TradingViewChart>` and `<PriceChart>` now accept `height="fill"` and the analysis page passes it. ResizeObservers in both components track height when `"fill"` so the chart follows panel-resize drags. Previously TradingView was hardcoded `height={520}` regardless of available space — the user reported "look at all the empty space".
  - **Make Default in watchlist dropdown** (user picked the suggestion). Each non-default option in `<WatchlistSwitcher>` has a ★ button that PATCHes `/api/watchlists/[id] { setDefault: true }` and refreshes in place. Users no longer need to navigate to `/dashboard/watchlists` to change their default — two clicks from anywhere the switcher appears.
- **Journal v2 phase 2: daily prompts** (`327a164`). New cron route `GET /api/cron/journal-prompts?type={pre-market|post-market}`. Auth via `x-cron-secret`. Creates stub entries for every user updated in the last 30 days with the two prompt templates baked into the route. Weekend skip. Idempotent via the `journal_prompt_uniq` index from phase 1 migration. Schedule (UTC): `0 12 * * 1-5` pre-market, `0 20 * * 1-5` post-market.

### Phase 3+ follow-up batch (also shipped 2026-05-13)

- **Phase 3 — categorized tags** (`eec626d`). Flat 9-tag PREDEFINED_TAGS replaced with `TAG_CATEGORIES` array: emotion (8 — discipline / patience / confidence / fear / greed / FOMO / revenge / boredom), strategy (8 — breakout / mean-rev / trend / swing / intraday / news / earnings / technical), execution (8 — followed plan / perfect / early exit / late entry / size too big / too small / stop too tight / too wide), outcome (6 — win / loss / breakeven / stopped out / full target / partial). 30 tags total. New IDs namespaced (`emotion_*`, `strat_*`, `exec_*`, `outcome_*`); legacy IDs (`followed_plan`, `fomo`, etc.) remain in `TAG_LABELS` for backwards-compat. Entry form groups tags by category; entry badges use category-aware color (emotion=warning, strategy=default, execution=neutral, outcome=bullish).
- **Phase 4 — cross-feature linking** (`eec626d`). Journal page reads `?symbol=` and `?date=` URL params on mount, pre-fills filter state (Suspense-wrapped for Next 15). `/api/journal` accepts `?date=YYYY-MM-DD` filter that matches both `prompt_date` and `created_at::date`. Performance attribution rows get a "Journal" link → `/dashboard/journal?symbol=X`. P&L Calendar day modal gets a "View journal entries for this day" affordance → `/dashboard/journal?date=YYYY-MM-DD`. Auto-trade journal entries show an "Open chart →" link to `/dashboard/analysis?symbol=...`.
- **Phase 5 — AI weekly review cron** (`eec626d`). New `GET /api/cron/journal-weekly-review` (x-cron-secret auth). For each active user (updated < 30 days), pulls trades closed in the last 7 days from `trader_trades` + journal entries from the last 7 days, sends to Groq llama-3.3-70b with a structured prompt (Week in numbers / What worked / What didn't / Pattern across the week / One question for next week). Output stored as a `weekly-review` journal entry. Idempotent via `journal_prompt_uniq` index. ~$0.005/user/week. Schedule (UTC): `0 22 * * 0` (Sunday 5pm ET during EDT).
- **Phase 6 — tagged-pattern behavioral badges** (`ba1df05`). New `GET /api/journal/patterns` route: unnest entry tags via `jsonb_array_elements_text`, INNER JOIN `trader_trades` on `trader_trade_id` WHERE pnl IS NOT NULL, GROUP BY tag, HAVING COUNT >= 5. Returns per-tag win rate + n + deviation from the user's baseline. Journal home renders top 8 deviating tags as colored chips (bullish if >+5pp better than baseline, bearish if >-5pp worse, neutral otherwise). Clicking a chip filters the entry list to that tag. Card hides itself when no tags hit the n threshold — quiet by design.
- **UI polish** (`eec626d`). Per-type badge on each journal entry (Manual / Trade stub / Pre-market / Post-market / Weekly review) with icon + tone. `isStubBoilerplate()` heuristic: entry notes ≤ 600 chars + `updatedAt === createdAt` = still boilerplate. Unfilled stubs/prompts sort to the top of the entry list with accent border + "Needs review" badge + italic muted notes; filled-in entries fall back to default styling.
- **Migration 0032 applied to prod** (2026-05-13, this session). `type` + `prompt_date` columns added; `journal_auto_trade_uniq`, `journal_prompt_uniq`, `journal_type_idx` indexes created. Verified via `\d trade_journal`.

### Other 2026-05-13 polish

- **Widget grid empty space** (`5f26141`). Dashboard widget cards had `h-full` which forced short widgets to stretch to match tall siblings → giant empty cards. Removed `h-full`. Grid now has `[grid-auto-rows:min-content] [grid-auto-flow:dense]` so widgets size to content and the layout packs tightly.
- **Portfolio empty-state loop** (`330a027`). `/dashboard/portfolio` empty state said "Add a paper portfolio or connect a broker" with no UI to actually do so. New `<CreatePortfolioCard>` renders an inline form (name + initial cash $100-$1M) that POSTs `/api/portfolio` and refreshes. Net Worth widget link reworded to "Create paper portfolio →" so users know where they're going.
- **L2 data future-idea doc** (`eec626d`). Full cost-tier breakdown in `docs/future-ideas.md § Real-time SIP feed`: Alpaca SIP $99/mo, TradingView Premium $60/mo + per-exchange $24-60/mo, Polygon $199/mo+, IEX paid tier, direct exchange feeds $500-5000/mo. Recommendation parked: don't build, user should view in broker's native app. Revisit if Pro tier ships.

### Cron schedule additions
Append to droplet crontab as `sn-deploy` (UTC):
```cron
# Daily journal prompts
0 12 * * 1-5 curl -fsS -H "x-cron-secret: $CRON_SECRET" https://beacontry.com/api/cron/journal-prompts?type=pre-market
0 20 * * 1-5 curl -fsS -H "x-cron-secret: $CRON_SECRET" https://beacontry.com/api/cron/journal-prompts?type=post-market
# AI weekly review
0 22 * * 0  curl -fsS -H "x-cron-secret: $CRON_SECRET" https://beacontry.com/api/cron/journal-weekly-review
```

## 2026-05-13 (audit batch) — Beginner-friendliness + correctness sweep

Multi-prong audit triggered by the user asking for "beginner-friendly" QoL fixes alongside a paranoid re-check of CSRF (which had regressed multiple times previously). Audit ran four parallel exploration agents covering CSRF, code-correctness, UX gaps, and design-system violations; findings consolidated into one commit batch.

### CSRF (defensive, no known active exploit)
- **`csrf-token` cookie now cleared on logout** (`src/app/api/auth/logout/route.ts`). Old token was lingering after logout; minor info-leak + the next session got 403s on the first mutating request until `/api/csrf` rotated.
- **Trailing-slash normalization in `pathIsCsrfExempt()`** (`src/components/csrf-init.tsx`). A trailing `/` on an auth route (e.g. via a redirect chain or old proxy) would slip out of the exemption set and cause the patched fetch to inject a CSRF header on `/api/auth/login/`, which then 403s because login doesn't validate CSRF. Now stripped before set-lookup.

### Code correctness
- **`crypto.randomUUID()` replaces `Math.random()` for TradingView container ID** (`src/components/dashboard/tradingview-chart.tsx`). One genuine bug among the 9 `Math.random()` hits; the other 8 are inside the GA optimizer where pseudo-random is correct.
- **`withTimeout(3000)` wrapper added to `GET /api/broker/connections`** (`src/app/api/broker/connections/route.ts`). Last unwrapped GET in the codebase; now returns 504 with `X-Query-Timeout: true` on statement-timeout instead of hanging.
- **Silent `.catch(() => {})` → logged catches.** Two in `src/lib/optimizer.ts` (progress writes during long-running jobs) and two in `src/lib/notifications.ts` (push + email best-effort). Without logging, optimizer "stuck" states and Resend rate-limit hits were undebuggable. The remaining `.catch(() => null)` instances are intentional graceful degradation (e.g. quote fetch fallback) — left alone with comments.
- **Raw `setInterval` → `usePolling` hook.** `src/components/layout/broker-switcher.tsx` (15s) and `src/app/dashboard/admin/page.tsx` (30s) were the last two raw intervals in the codebase. usePolling pauses on tab-hidden, eliminating background-tab traffic.

### Beginner-friendly UX
- **`<HelpTip>` + `<FieldLabel>` primitives** in `src/components/ui/help-tip.tsx`. Tiny `?` info circle that opens a Radix Tooltip with a one-line explanation. Built on top of the existing `<Tooltip>` and `<TooltipProvider>` (already mounted in dashboard layout).
- **`<Input>` and `<Select>` now accept an optional `help` prop** that renders a HelpTip next to the label. Backward-compatible — fields without `help` look unchanged. Requires a TooltipProvider ancestor (dashboard layout) so don't set `help` on auth-page Inputs.
- **Trader risk profile fields all have help text** (`src/app/dashboard/trader/page.tsx`). Each of the 7 risk-override fields (Account Size, Max Daily Loss %, Max Drawdown %, Max Position %, Max Position Size, Max Single Trade Loss, Max Exposure ×) shows a one-line explanation of the concept and typical values on hover.
- **Manual Order ticket help text** (`src/app/dashboard/trade/[symbol]/page.tsx`). Order Type, Time-in-Force, Limit Price, Stop Price all have HelpTips. Dropdown option labels expanded to plain-English ("Market — fill now at current price", "Day — expires at market close").
- **Backtest help text** (`src/app/dashboard/backtest/page.tsx`). Stop Loss %, Trail Stop %, Take Profit %, Hold Period each carry a HelpTip. Auto-tune (⚡) button now has a tooltip explaining ATR-based tuning.
- **Strategy Builder help text** (`src/app/dashboard/strategy-builder/page.tsx`). Same treatment on Stop Loss / Take Profit / Max Hold.
- **Empty states with CTAs.** Replaced raw "No X yet" with explanatory text + next-action links:
  - Trader page: Recent Signals → links to Screener + Education hub; Recent Trades → links to Education
  - Alerts page: "Create your first alert" button surfaces the create form; history shows what triggers look like
  - Performance page: explains "stats appear within 24h of trading" + Trader page link
  - Feed page: points to Analysis page for sharing a signal
- **Generic error messages → actionable error messages.** "Save failed", "ATR computation failed", "Order submission failed" now include the underlying reason from the API error envelope (when present) plus a one-line nudge ("Check your connection and retry" / "Try again or check if you're still signed in").

### Re-audit findings (post-change)
- `tsc --noEmit` clean
- `npx vitest run` — all 387 tests pass
- `next build` crashed with `WasmHash._updateWithBuffer` on Node 24 — environmental webpack bug, not related to this change; CI runs Node 20 LTS where it doesn't reproduce
- Lint warnings only on pre-existing unused vars; no new errors
- CSRF spot-check: every `POST/PUT/PATCH/DELETE` route under `src/app/api/**/route.ts` (75 files) uses `requireAuthWithCsrf` or `validateTraderSecret` (trader-secret routes) or is in the documented exemption list (login/register/logout/pin-login/validate-invite). No new bypasses.

### Files touched (commit batch)
- `src/app/api/auth/logout/route.ts` — clear csrf cookie on logout
- `src/components/csrf-init.tsx` — trailing-slash normalization
- `src/components/dashboard/tradingview-chart.tsx` — crypto.randomUUID
- `src/app/api/broker/connections/route.ts` — withTimeout + 504 path
- `src/lib/optimizer.ts` — log progress-write failures
- `src/lib/notifications.ts` — log push + email failures
- `src/components/layout/broker-switcher.tsx` — usePolling
- `src/app/dashboard/admin/page.tsx` — usePolling
- `src/components/ui/help-tip.tsx` — NEW (HelpTip + FieldLabel)
- `src/components/ui/input.tsx` — optional `help` prop
- `src/components/ui/select.tsx` — optional `help` prop
- `src/app/dashboard/trader/page.tsx` — risk profile help text + empty-state CTAs
- `src/app/dashboard/trade/[symbol]/page.tsx` — order ticket help text + better order errors
- `src/app/dashboard/backtest/page.tsx` — field help text + auto-tune tooltip + better errors
- `src/app/dashboard/strategies/page.tsx` — better save/auto-tune errors
- `src/app/dashboard/strategy-builder/page.tsx` — field help text
- `src/app/dashboard/alerts/page.tsx` — empty-state CTAs
- `src/app/dashboard/performance/page.tsx` — explanatory empty state
- `src/app/dashboard/feed/page.tsx` — actionable empty state
- `public/docs/beacontry-features.html` — note new help-text affordances

No database migrations. No deploy steps beyond the standard image rebuild.

---

## 2026-05-14 — Reddit ticker-mention feed (community v1)

First external community-data integration. Surfaces recent Reddit posts mentioning a watchlist ticker on the Analysis page → new **Reddit** intelligence tab. No auth required (public JSON at `reddit.com/r/{sub}/search.json` is generous on rate limit with a non-default User-Agent).

### Admin-configurable subreddit list
`reddit_subreddits` table (migration `0033`) is the source of truth for which subs get queried. Admins manage it from **`/dashboard/admin` → Reddit Feed Sources** card — add/toggle/reweight/delete, no code change required. Every mutation writes a hash-chained `REDDIT_SUBREDDIT_UPDATED` audit row.

Columns:
- `name` (lowercase canonical, unique via `LOWER(name)` functional index)
- `display_name`, `description`
- `weight` (numeric 0–2) — sentiment-aggregation weight; lets admins down-weight noisy subs (r/wallstreetbets seeded at 0.40) without removing them
- `enabled` (soft-disable)

Seeded with the standard finance set: r/stocks, r/investing, r/SecurityAnalysis, r/wallstreetbets.

### Data flow
- `src/lib/reddit.ts` — per-sub fetch with 5s timeout + `Promise.allSettled` (one bad sub doesn't tank the result), in-memory cache per `(symbol, sub)` 10-min TTL, word-boundary regex filter (rejects loose matches like "AAPLE" matching "AAPL"), score-min filter to drop ghost posts, dedup by post id. Uses existing `scoreHeadline()` from `src/lib/headline-sentiment.ts` for per-post sentiment label (same lexicon as News tab chips).
- `src/app/api/reddit/[symbol]/route.ts` — GET, session-auth, `withTimeout(3000)` on the subreddit-list query, 5-min response cache. Degrades gracefully on Reddit fetch failure (returns 200 + `unavailable: true` empty shape — same pattern as social-sentiment + transcripts routes).
- `src/app/api/admin/reddit-subreddits/route.ts` — GET / POST / PATCH / DELETE, admin-only via `requireAuthWithCsrf(request, ["admin"])`, audit-logged. Calls `clearRedditCache()` on every mutation so the user-facing feed sees changes on the very next request.

### Surfaces
- **Analysis → Reddit tab** (`src/components/dashboard/intelligence-reddit-tab.tsx`): post cards with subreddit · time-ago · score · comments · author · flair · sentiment badge · link-out. Empty-state copy directs users to admin page when no subs configured.
- **Admin → Reddit Feed Sources** card (`src/components/admin/reddit-subreddits-card.tsx`): add form (name/weight/description) + table with editable weight + on/off toggle + delete. Optimistic toggle with revert-on-failure.

### Not wired in (v1 product decision)
Reddit sentiment is **NOT** fed into `src/lib/hybrid/sentiment-layer.ts` that the engine reads — purely user-facing intelligence for now. Re-evaluate after a few weeks of observing data quality + backtest evidence.

### Apply on prod
```bash
scp drizzle/0033_reddit_subreddits.sql deploy@<host>:/tmp/
ssh deploy@<host> "sudo -u postgres psql sentinel_db -v ON_ERROR_STOP=1 -f /tmp/0033_reddit_subreddits.sql"
```
Idempotent — `IF NOT EXISTS` on every CREATE, `ON CONFLICT DO NOTHING` on seed. No CSP change needed — Reddit fetches happen server-side.

---

## 2026-05-14 — Tier enforcement + paywall UX + Stripe billing

Eight-phase rollout in a single day taking Beacontry from "invite-only beta with marketing pricing" to "revenue-capable hosted SaaS with full tier enforcement, paywall UX, and Stripe-driven billing."

### Phase A — Public free-tier signup
`/api/auth/register` accepts anonymous signups for the `free` tier. Honeypot + IP rate-limit + format check defenses; invite path preserved for admin-issued tiered comp accounts. Register page shows the standard form when no token provided.

### Phase B — Free-tier dashboard landing
New components: `<FreeTierWelcome>` (dismissible welcome card on `/dashboard`), `<SidebarTierBadge>` (Upgrade pill for free, "Trader plan · Manage" chip for paid), `<TraderTierRequired>` (full-feature paywall card above `/dashboard/trader`).

### Phase D — Privacy + contact + ToS billing language
`/privacy` (full SaaS privacy policy with sub-processor list), `/contact` (email + dashboard tickets + security disclosure). `/terms` extended with sections 8-11: Subscriptions, Cancellation, Refunds (30-day full + prorated annual), Payment Disputes. `TERMS_VERSION` bumped to `2026-05-14` so existing users re-accept.

### Phase C — Stripe billing end-to-end
Migration `0036_stripe.sql` adds `users.stripe_customer_id` + `stripe_events_processed` table (webhook idempotency dedup). New files: `src/lib/stripe.ts` (lazy SDK client, key lookup via `system_config` → env fallback), `src/lib/billing-prices.ts` (price-ID source of truth; env-var override for live mode). Routes: `/api/billing/checkout` (POST → Checkout Session URL), `/api/billing/portal` (POST → Customer Portal URL), `/api/webhooks/stripe` (POST receiver — signature-verified, idempotent via `stripe_events_processed`, handles 6 events: `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `invoice.payment_{succeeded,failed}`). Dashboard: `/dashboard/billing` with current-plan + upgrade grid for free users + Manage button for paid. `<UpgradeButton tier cadence>` component used everywhere CTAs route to checkout.

**Stripe API version pinned**: `2026-04-22.dahlia`. Critical: `current_period_end` moved from Subscription object to `items[0]` in this version — the webhook reads from the new location (with fallback) so `tier_expires_at` is correctly set. Sandbox tested end-to-end with test card `4242 4242 4242 4242` on a fresh free user; `test@test.com` user has tier=trader, stripe_customer_id, tier_expires_at correctly populated, audit log shows USER_TIER_CHANGED rows with manual=false.

**Marketing alignment**: Premium price corrected from `$45/$450` to `$40/$400` across landing + pricing + README + future-ideas — Stripe was the source of truth.

**Going live checklist**: business profile verification in Stripe (1-2 business days), generate `sk_live_` + live webhook, "Copy to live mode" on Trader + Premium products, swap keys in `/dashboard/admin/system-config`, optionally override price IDs via env vars. Stripe Tax stays OFF until activated in Stripe dashboard + US nexus declared per state.

### Phase E1 + E2 — API tier gates (63 new gates)
Goal: close the "pricing promises one thing, code enforces another" gap. Before: 4 routes gated. After: 64 routes gated.

**Premium gates** (4): `/api/chat`, `/api/filings/chat`, `/api/insights/[symbol]`, `/api/trader/summarize-trade`.
**Trader gates** (60): 11 Finnhub per-symbol (news, sentiment, fundamentals, options, insider, recommendations, peers, social-sentiment, volatility, profile), 6 engine+broker (trader/dashboard, trader/engine, broker/account, broker/connections + activate + test, risk-profile), 13 analysis (analyze[+daily+confluence], breadth, sector-rotation, relative-strength, multi-timeframe, unusual-activity, correlation, heatmap, accuracy[+symbol], signals/export, screener), 14 backtest+optimizer+strategies+paper-trading, 8 journal/tax/performance/pnl-calendar, 2 alerts, 6 multi-watchlist+multi-layout.

**Optimizer fix**: `/api/optimize/*` previously required `requireAuthWithCsrf(request, ["admin"])` — now just `requireAuthWithCsrf(request)` + Trader tier check, so paying Trader users can run their own optimizer (the documented product promise on `/pricing`) instead of needing an admin to do it for them.

### Phase E3 — Engine tier-awareness
`EngineState.userTier` captured at `startEngine()` from DB. Hybrid pipeline options now branch on tier: Trader users get `enableAiScoring: false` (stays Finnhub-driven layers only), Premium+ users get the full pipeline. Mid-session tier changes don't reshape a running pipeline — they take effect on engine restart.

### Phase F — Admin nav hidden from non-admins
`<NavItem>` and `<SubNavTab>` interfaces gained `adminOnly?: boolean`. New helpers `visibleNavItems(role)` + `visibleSubNav(tabs, role)` filter at render time. Admin top-level nav item + admin-only sub-nav tabs (e.g., `/dashboard/optimizer` was tagged but the flag was a no-op before) are now hidden entirely for non-admins. Sidebar (desktop + mobile), sub-nav, command palette all filter consistently. `/api/me/tier` now returns `role` so the client can filter. **The pages themselves still server-side enforce role** — this is purely UX.

### Phase G — Paywall banners on paid pages
New generic `<PaywallBanner minTier featureName description?>` component sits at the top of 28 paid dashboard pages. Hides for users at or above tier; renders an upgrade card for users below. Applied to all major paid pages (analysis, news, sentiment, screener, backtest, optimizer, alerts, strategies, journal, performance, tax, etc.). Replaces the previous experience where free users would visit paid pages, see broken empty states, and 402 errors in DevTools without explanation.

**HTML tier reference**: `public/docs/tiers.html` — full feature comparison matrix (~60 rows × 5 columns), tier-vs-role explanation, "which tier should you pick?" scenario cards, upgrade/downgrade/cancellation mechanics, technical enforcement details, pricing FAQ. Linkable from `/pricing` and the public-shell footer.

### Migration applied
- `0036_stripe.sql` — `users.stripe_customer_id` + `stripe_events_processed` table. Applied to prod 2026-05-14.

### Test coverage
- `tests/unit/billing-prices.test.ts` (17 tests) — tier↔price mapping bijectivity + env override + display labels + trial period constant
- `tests/unit/tiers.test.ts` (20 tests) — existing
- `tests/unit/system-config.test.ts` — KNOWN_KEYS asserts STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET added
- 440/440 tests passing post-batch

### Going-live remaining
1. **Stripe live-mode activation**: business profile verification + Activate live mode + copy products to live + new sk_live_ + new webhook secret. ~30 min user, 1-2 days Stripe approval.
2. **Sentry / uptime monitoring**: not blocking but recommended before paying customers.
3. **Pricing live-mode price ID swap**: either edit `src/lib/billing-prices.ts` hardcoded defaults OR set `STRIPE_PRICE_<TIER>_<CADENCE>` env vars on the droplet.

---

## 2026-05-15 — Public marketing surfaces: pricing flow, tier doc cleanup, landing waitlist removal

Follow-on to the 2026-05-14 tier + billing rollout. Closes three contradictions that the day-after walkthrough surfaced: pricing CTAs all bounced to a generic `/register` regardless of plan; the public tiers doc still listed Enterprise + Self-Hosted as if they were ordinary tier columns; the landing page's final CTA was a waitlist asking visitors to wait for "public signup" — which has been open all along.

### Plan intent through /pricing → /register → Stripe Checkout
End-to-end flow so a visitor who clicks "Start with Trader" lands at Stripe with the right plan, not on a generic free-tier dashboard with no upgrade path.

- `/pricing` Trader + Premium CTAs route to `/register?plan=<tier>&cadence=month`. Free CTA unchanged.
- `/register` reads `?plan=&cadence=`, renders plan-aware header ("Start your Trader trial"), price chip ($20/mo · 7-day trial), and "Continue to checkout" button text. Tier is still hardcoded to `free` server-side; plan intent is a UX hint only.
- On successful registration with plan intent, redirects to `/dashboard/billing?upgrade=<tier>:<cadence>` instead of `/dashboard`.
- `/dashboard/billing` wrapped in `<Suspense>`; reads `?upgrade=` via `useSearchParams`, auto-POSTs `/api/billing/checkout` once on mount, redirects to Stripe. Guards: `autoCheckoutFired` ref against StrictMode double-fire, tier check against already-paid users, URL param self-clears so back-button doesn't re-trigger.
- Return-from-Stripe `?success=1` / `?canceled=1` get toast feedback ("Payment successful — your plan will update within a few seconds" / "Checkout canceled — pick a plan below to try again"). URL params clear after firing.
- `<UpgradeButton>` anonymous fallback now carries `?plan=&cadence=` so the same plan-intent flow fires from any anonymous click of an upgrade CTA, not just the pricing page.

### Public tiers doc (`public/docs/tiers.html`) — Enterprise + Self-Hosted dropped
The matrix used to be 4 columns (Free / Trader / Premium / Self-Hosted) with Enterprise mentioned only in the "Which tier should you pick?" scenario cards. Audit of `src/lib/tiers.ts` showed Enterprise has zero `checkTier(.., "enterprise")` calls in the codebase — it gates nothing today. Self-Hosted isn't a tier at all, it's a deployment model.

- Matrix is now 3 columns: Free / Trader / Premium.
- Drops the Enterprise "contact us" scenario card and the Self-Hosted "run on your own hardware" scenario card.
- Drops two FAQ entries that were Self-Hosted-specific (API keys for self-hosted; Open Source vs Source Available).
- Drops the Self-Hosted tier card from the top-of-page grid.
- `Tier` enum in code keeps Enterprise — admins can still grant it manually from `/dashboard/admin` (it never expires through cron, per `effectiveTier()` special case). Public surfaces just stop advertising it.

### Stale "invite-only beta" copy on /pricing
Three places contradicted public free signup being open:

- FAQ #4 "Is there a free trial?" rewritten — covers the permanent free tier + 7-day trial on paid plans + 30-day refund window. Drops "Beacontry is currently invite-only beta — join the waitlist."
- Final CTA section "Beacontry is currently invite-only beta. Join the waitlist..." → "Sign up free + Start Trader trial" buttons.
- Team / family-office / firm FAQ entry + "Need team / firm / white-label? Email us for Team and Enterprise pricing" subtext below the tier cards: both removed. We don't currently offer team plans, so promising "$299/seat/mo with RBAC + SLA + white-label" was promising what we don't ship.

### Landing waitlist (`src/app/page.tsx`) → "Explore freely" link grid
The waitlist card asked visitors to drop their email and "we'll let you know when public signup opens." Public signup has been open for over a day. Replaced with a 6-card grid under "Or explore freely — no account needed":

- `/learn` — Education hub (14 long-form guides)
- `/tools` — Free calculators (8 — FIRE, Roth, tax-loss harvesting, …)
- `/glossary` — 95 trading + investing terms
- `/docs/engine-ruleset.html` — Full ruleset for the 8 engine modes
- `/docs/tiers.html` — Feature matrix + pricing FAQ
- `github.com/beacontry/Sentinel` — Source code (FSL-1.1)

Waitlist state, honeypot field, and POST handler removed from the page. `/api/waitlist` route + waitlist table + migration `0034_waitlist.sql` left in place for any future "back-in-stock" use; landing just unwired the caller.

### CLAUDE.md Registration & Invites rewritten
Documents the three register paths that now exist:

1. **Public free signup** — `/register`, anonymous, creates `free`-tier account
2. **Plan-intent signup** — `/register?plan=trader|premium&cadence=month|year`, anonymous, plan-aware UI, forwards to billing-with-upgrade hint after signup
3. **Invite-token signup** — `/register?token=...`, admin-issued, email locked, tier inserts as `free` (admin upgrades post-signup)

Tier is always hardcoded `free` server-side regardless of path; real grant comes from Stripe webhook on successful payment.

### Files touched
- `public/docs/tiers.html` — Enterprise/Self-Hosted columns + scenarios + FAQ entries dropped
- `src/app/pricing/page.tsx` — Trader/Premium CTAs carry plan params; team FAQ + sales subtext removed; "invite-only beta" copy replaced
- `src/app/register/page.tsx` — reads `?plan=&cadence=`, plan-aware UI, post-success redirect to billing
- `src/app/dashboard/billing/page.tsx` — Suspense wrap; auto-checkout on `?upgrade=`; success/cancel toasts; URL self-clear
- `src/components/tiers/upgrade-button.tsx` — anonymous fallback carries plan
- `src/app/page.tsx` — waitlist card → explore-freely grid
- `CLAUDE.md` — Registration & Invites section rewritten


---

## 2026-05-16 — Audit-driven hardening: security, a11y, theming, tooling

Six-batch sweep through the engine + UI quality audit findings.
Top-line: vulnerability count went from 8 (1 critical / 2 high / 5
moderate) to **0**. Three accessible-modal regressions fixed. Chart
theming wired to CSS tokens. Lint migrated off the soon-removed
`next lint`. All 467 unit tests pass throughout.

### Batch 1 — Security (P1.1 + P1.2)
- Removed `sanitize-html` + `@types/sanitize-html` (zero usages,
  was carrying GHSA-rpr9-rxv7-x643 critical XSS).
- `next` 15.3.1 → 15.5.18 (security patches). Held off the 15→16
  major bump for a deliberate batch.
- `drizzle-orm` 0.38.3 → 0.45.2 (closes SQL identifier escape
  advisory).
- `drizzle-kit` 0.30.1 → 0.31.10.
- Added `overrides.postcss ^8.5.10` to force-patch postcss through
  next's transitive resolution.
- Extracted the SW registration `<script>` from `src/app/layout.tsx`
  into `/public/sw-register.js`. Loaded via `<script src defer>`.
- Dropped `'unsafe-inline'` from CSP `script-src` in
  `next.config.ts`. `'unsafe-eval'` stays dev-only for HMR.

### Batch 2 — Muted-text contrast (P1.4)
WCAG AA fixes for `--color-text-muted` (and landing counterparts)
on dark themes. Previous values were ~3.1-3.5:1 against typical
card surfaces — below AA's 4.5:1 for normal text.

| Theme | Token | Was | Now | New contrast on bg-surface |
|---|---|---|---|---|
| .dark | `--color-text-muted` | #607b71 | #7f9389 | ≈4.9:1 |
| .dark | `--color-ld-text-muted` | #67627e | #8780a3 | ≈5.6:1 |
| .gray | `--color-text-muted` | #71717a | #8d8d96 | ≈5.0:1 |
| .gray | `--color-ld-text-muted` | #71717a | #8d8d96 | ≈5.0:1 |

Light-mode variants (default / coral / light-blue) use dark text
on light surfaces — opposite direction, not flagged, unchanged.

### Batch 3 — Modal/drawer a11y (P1.3)
- `src/components/ui/modal.tsx` — Radix `Dialog.Root` flipped from
  `modal={false}` to `modal={true}`. Auto-grants focus trap,
  body-scroll lock, and `aria-modal="true"` on `Dialog.Content`.
  Removed manual `onClick={onClose}` on overlay (Radix handles
  outside-click-to-close when `modal={true}`).
- New shared hook `src/hooks/useDrawerA11y.ts` (70 lines): focus
  trap, initial focus on close button, focus restore to trigger on
  unmount. Used by `PositionDetailSheet`, `SymbolPreviewSheet`, and
  the mobile-menu drawer in `AppShell`.
- All three drawer containers now carry `role="dialog" + aria-modal
  ="true" + aria-label + tabIndex={-1}`. Close buttons enlarged to
  44×44 with descriptive aria-labels.

### Batch 4 — Chart theming (P2.5)
- New `src/lib/chart-theme.ts` adapter. `getChartTheme()` reads CSS
  custom properties at call time (bg-surface, text-secondary,
  border, border-hover, bg-elevated, accent, text-muted) and
  returns chart-config tokens.
- `PriceChart` (3 internal chart instances: main, RSI overlay,
  MACD overlay) and `BacktestChart` (equity curve + baseline price
  line) call it during chart init. Hardcoded #ffffff / #e2e8f0 /
  #64748b / #94a3b8 values removed.
- Theme switches mid-session aren't reactive (chart reads tokens
  once on mount). Acceptable for current dashboard flow; can be
  made live-reactive later by keying parent `<div>` by theme.

### Batch 5 — Touch targets (P2.6)
- Analysis page mobile "add symbol" button: h-9 w-9 (36×36) →
  h-11 w-11 (44×44). Added aria-label.
- Widget remove button in dashboard edit mode: h-7 w-7 (28×28) →
  h-11 w-11 (44×44).
- Modal/drawer close buttons (already bumped in Batch 3).

Accepted residual: P&L year-heatmap cells stay at 14×14px (annual
density is the feature; keyboard + screen-reader access via
existing `role="button"` + `onKeyDown` handler).

### Batch 6 — Tooling (P2.7 + Batch 1 residuals)
- Lint migrated off `next lint` (deprecated, removed in Next 16):
  `package.json` script `next lint` → `eslint .`. Added explicit
  `ignores` block to `eslint.config.mjs` so `eslint .` doesn't
  walk .next/, node_modules/, drizzle/meta/, etc.
- Added `overrides.esbuild ^0.28.0`. Resolves the vite@8 vs
  drizzle-kit's nested @esbuild-kit version conflict (was
  ELSPROBLEMS), AND closes the 4 moderate audit findings that
  Batch 1 marked as residual.

**Net audit result:** `npm audit` reports **0 vulnerabilities**.
`npm ls esbuild` clean across the dependency tree. Lint: 0 errors,
77 warnings (pre-existing unused-var warnings, not regressions).

### Files touched (across all 6 batches)

Code:
- `next.config.ts` (CSP)
- `src/app/layout.tsx` (SW script extraction)
- `src/app/globals.css` (muted-text token bumps)
- `src/components/ui/modal.tsx` (Radix modal=true)
- `src/components/dashboard/position-detail-sheet.tsx` +
  `src/components/ui/symbol-preview-sheet.tsx` +
  `src/components/layout/app-shell.tsx` (drawer a11y)
- `src/components/dashboard/price-chart.tsx` +
  `src/components/dashboard/backtest-chart.tsx` (theme tokens)
- `src/app/dashboard/analysis/page.tsx` +
  `src/components/dashboard/widget-wrapper.tsx` (touch targets)
- `eslint.config.mjs` (ignore directories)

New files:
- `public/sw-register.js` (external SW registration)
- `src/hooks/useDrawerA11y.ts` (shared focus-trap hook)
- `src/lib/chart-theme.ts` (CSS-token chart adapter)

Package metadata:
- `package.json` — dep bumps, `overrides` block, lint script
- `package-lock.json` — regenerated
