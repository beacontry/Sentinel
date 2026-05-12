# Sentinel — Future Ideas

## Phase status (2026-05-12 marathon)

After a long build session, the originally-queued 6 phases are done. What follows is a tracking table; the descriptive sections below remain as design notes for items still pending.

| Phase | Theme | Shipped | Pending |
|-------|-------|---------|---------|
| 1 | Money bugs (UI-lie audit) | ✅ Wash-sale + PDT live refresh, bootEquity day-boundary re-snapshot, halted-state synchronous DB write, P&L source labels | (none — false positives dropped) |
| 2 | Frozen-value cleanup | ✅ peakPrice reset on partial close, trailingStopPct + takeProfit re-resolved on every sync | `pos.entryDate` from broker creation time |
| 3 | Cache invalidation | ✅ Filter-cache 6h TTL, screener `scanStartedAt`, engine `scanStartedAt` | (none) |
| 4 | Engine intelligence | ✅ Sector exposure cap, earnings blackout, per-symbol P&L heatmap widget | Adaptive mode auto-switching, engine dry-run mode |
| 5 | Strategy testing & analytics | ✅ Compare strategies side-by-side | Engine dry-run, live-vs-backtest divergence tracker, mean reversion mode |
| 6 | Frontend bigger asks | ✅ Real `/dashboard/portfolio` overview, `/api/quotes` batch endpoint, Trader 2-col XL layout | Persist recently-viewed to DB |

**Themes that remain large unbuilt scopes:**
- Options trading module (theta-gang extension) — XL, separate product surface
- Real-time WebSocket quotes — M-L, defer until intraday/scalp engine mode demands it
- Copy trading (eToro/Autopilot pattern) — L, needs user-base to be worthwhile
- Mean-reversion engine mode — L, defer until momentum-only validates in paper
- User-code backtest sandbox (Python/JS) — XL, QuantConnect territory
- Public read-API + per-user API keys — M
- Generic outgoing webhooks beyond Discord — S, pair with public API
- Native iOS/Android apps — XL (PWA push covers most)
- Bonds / mutual funds / international markets — depends on Alpaca upstream
- Earnings call transcript AI summary — needs paid Finnhub tier

The 2026-05-12 dated sections below contain detailed retrospective notes for each phase. The undated sections at the top are the long-form design notes for items still pending.

---

## Optimizer Improvements

### Momentum-Weighted Position Sizing in Backtester
Currently the optimizer backtester uses fixed 10% per position (equal weight). Instead, allocate capital proportional to each stock's momentum score:

```
weight = momentum_score / total_momentum_scores
positionSize = weight × available_capital
```

Stocks with stronger 60-day momentum get larger allocations. This matches how tactical-smart already sizes positions live (inverse volatility weighting). Applying it in the backtester means the GA would optimize for strategies that work with momentum-weighted portfolios — closer to real trading behavior.

**Impact:** Medium. Improves backtest realism and may find strategies that pair better with concentration in high-momentum names.

---

## Path to Live Trading

A practical checklist before flipping the engine off Paper Mode. Order matters — don't skip ahead.

### Before Live (the actual gate)

- **60 trading days of clean paper.** No manual restarts. No `engine_alerts` rows for `stall` or `broker_disconnect`. No daily-loss halts that didn't auto-recover. If something does fire, fix it and reset the clock.
- **External health monitoring.** UptimeRobot (or similar free tier) pointed at `https://<domain>/api/health/engine`. The in-process watchdog can't catch "container is dead entirely" — only an outside prober can.
- **Refuse to trade when `brokerConnected=false`** (P1 from audit). Currently the engine keeps going on stale prices when Alpaca is unreachable. Not urgent for paper; matters for live.
- **Backoff on Alpaca rate limits** (P1 from audit). With 500-symbol scans + per-position `replaceOrder` calls, bursts can hit the 200 req/min cap. Add a token-bucket wrapper around the broker client.
- **Position-size ramp.** Start live at `positionPct` = 1/5 of paper (e.g. 3% if paper is 15%) for the first 30 days. Ratchet up if nothing breaks.
- **Tested DB backup restore.** Untested backups aren't backups. Run a dry-run restore to a scratch instance once before going live.

---

## Options Trading Module (Theta-Gang Extension)

A separate product direction targeting a different audience: premium-selling options traders ("theta gang"). Not a feature on top of the current equity engine — different mental model, different math, different broker calls. Worth scoping as its own engine that shares infrastructure (auth, broker connection layer, dashboard shell, watchdog) but has its own data model and signal pipeline.

### Target user
Retail options sellers running mechanical strategies — wheel, premium harvest, defined-risk credit spreads, IV-crush plays around earnings. Current Sentinel users (long-only momentum/trend equity) are a different persona.

### Data model additions
- `options_contracts` — OCC symbol (e.g. `AAPL250117C00150000`), underlying, strike, expiration, type, multiplier
- `options_positions` — extends position concept with strike, expiration, side, opening credit/debit, current Greeks snapshot
- `options_legs` — for multi-leg strategies (spreads, condors, iron butterflies); each position is N legs with a relationship
- `iv_history` — daily IV per symbol so "IV rank" (current IV vs 1-year range) can be computed without a paid feed

### Broker integration
Alpaca has an Options API. Extend `BrokerClient` (`src/lib/brokers.ts`) with `getOptionsChain`, `getOptionsPositions`, `placeOptionOrder` (single + multi-leg). One client does both stocks and options.

### New engine modes

| Mode | Behavior |
|---|---|
| `wheel` | Per symbol: sell cash-secured put → if assigned, sell covered call → loop. State machine per ticker. |
| `premium-harvest` | Sell ~30-delta OTM puts/calls on watchlist meeting filters (IV rank > 50, liquid, no earnings within DTE). |
| `credit-spread` | Defined-risk: sell a put, buy a further-OTM put. Less premium, capped loss — better for retail capital. |
| `iv-crush` | Sell strangles 1-2 days before earnings, close after IV collapses post-earnings. Event-driven. |

GA optimizer extends naturally: tunes `targetDelta`, `dteMin/Max`, `profitTargetPct`, `lossMultiple`.

### Signal pipeline
Replace technical indicators with chain-derived signals: IV rank/percentile, liquidity gates (open interest, bid-ask spread), strike selection by delta target, DTE windows (most strategies live 30-45 DTE), earnings calendar gate. Existing Finnhub earnings + sentiment integration is reusable.

### Risk math
Different from equities in non-trivial ways:
- **Position size = collateral**, not premium. CSP at strike $45 reserves $4500 cash. `maxExposure` math reworked.
- **Portfolio Greeks** dashboard — total delta (directional), total theta (daily decay collected), total vega (vol exposure).
- **Pin risk** near expiration on ATM positions; **early assignment risk** on American-style options.
- Buying-power utilization more variable — selling options consumes margin headroom unevenly.

### Exit logic (mechanical, not indicator-driven)
- **50/21 rule**: close at 50% of max profit, OR at 21 DTE, whichever first
- **2× credit stop loss**: if value doubled against you, close
- **Roll vs close** decisions when assignment looms — likely manual UI helper before automation

The 1-min `runExitCheck` shape is reusable — same skeleton, different criteria.

### Backtesting — the honest pain point
Historical options data is paid. Yahoo doesn't have it usable. Realistic sources: Polygon Options (~$30/mo end-of-day), OptionMetrics, ORATS, CBOE DataShop. Without it, the GA optimizer is flying blind. Live paper-trading is the realistic feedback loop until budget allows real options data.

### Suggested phasing
1. **Read-only positions** — track existing Alpaca options positions on dashboard, show Greeks + P&L. No automation. ~1-2 weeks.
2. **Manual order helpers** — UI for delta-driven strike selection, DTE picker, premium estimator. Submit via Alpaca. Still user-driven. ~2 weeks.
3. **Automated wheel** — single-symbol state machine, conservative defaults. ~3-4 weeks.
4. **Backtesting + additional strategies** — only after real options data is wired up.

**Impact:** High — entire new product line. Reuses ~30% of Sentinel infrastructure (auth, broker layer, dashboard shell, push, watchdog) and rebuilds the rest. Don't bundle with equity engine work; ship as a sibling module behind a feature flag.

---

## Operational visibility

### Slack/Discord/email notifications
Webhook destinations attached to audit-log events. Subscribe to: `engine.halted`, `engine.live_blocked`, `order.rejected`, `auth.login_failed`, `engine.position_disappeared`. Per-user webhook config in a new table; admin can also configure system-wide channels for halt events. Hooks into existing Resend infra for email. ~200 LOC + migration for webhook config table.

**Why:** monitor from phone without dashboard staring. Especially valuable during the first weeks of live trading.

### ~~Daily P&L digest email~~ ✅ SHIPPED
The market-close cron now emails opted-in users alongside the existing Discord webhook + PWA push channels. Opt-in via Settings → Display preferences. See migration `0024_digest_email_opt_in.sql`.

---

## Engine intelligence — 3 of 5 shipped (Phase 4)

Shipped in commit (this batch):
- **Sector exposure cap** ✅ — `risk_profile.max_sector_exposure_pct` column. `canPlaceBuyOrder` sums position market values per sector via `buildSectorExposureContext()` and refuses BUYs that would push a sector over the cap. Migration 0029. Wired into main scan; tactical / smart / swap / add paths inherit the basic gates but not the sector cap (would need same context threading).
- **News/earnings blackout** ✅ — `risk_profile.earnings_blackout_days`. `canPlaceBuyOrder` calls `isInEarningsBlackout()` when the cap is set. Migration 0029.
- **Per-symbol P&L heatmap widget** ✅ — new `pnl-heatmap-widget` registered in the widget registry. Reads `/api/performance/attribution`. Top-5 contributors with proportional bars; full attribution on `/dashboard/performance` for the long-form view.

### Still pending — adaptive mode + dry-run

**Adaptive mode switching** — `risk_profile.adaptive_mode_enabled` column shipped (migration 0029) but no consumer wired. Need:
- Read VIX + SPY/SMA50 state at scan start (already computed elsewhere — see breadth API)
- Define mode-suggestion rules (VIX < 18 + SPY > SMA50 → optimized; etc.)
- Either auto-switch (risky — surprises the user) or just surface a "regime suggests X mode" UI nudge
- Defer until the engine has 60 days of clean paper data to validate the regime classifications

**Engine dry-run mode** — needs a `dryRun: boolean` on `EngineState` + a gate at `placeEngineOrder` that logs would-be orders to `trader_trades` with `status='DRY_RUN'` instead of calling the broker. Lets users test strategy code changes against live signals without risk. ~150 LOC. Worth doing before any major engine refactor; for now defer until there's a specific change to dry-test.

### Mean reversion strategy

Adds an `oversold-bounce` mode alongside momentum-only modes. RSI < 30 + price > SMA200 + above-avg volume → buy. Exits on RSI > 55 OR time-stop 10 days. Diversifies engine edge. ~250 LOC, biggest engine change — defer until momentum-only is profitable in paper.

**Why:** momentum strategies underperform in choppy markets; mean reversion thrives there. Running both modes with capital allocation across them smooths the return curve.

---

## Strategy testing — 1 of 3 shipped (Phase 5)

Shipped:
- **Compare strategies side-by-side** ✅ — new `/dashboard/backtest/compare?ids=…` route. Pick up to 5 saved strategies (URL-driven so links are shareable), see stats columns (Return / Win Rate / Trades / Max DD / Sharpe / Sortino / Calmar / MAR) and an equity-curve overlay (normalized to start = 100 so different starting balances are visually comparable). New `/api/backtest/compare?ids=...` endpoint. "Compare strategies" button on the existing Saved Strategies card.

Still pending:

### Engine dry-run mode
New `dryRun: boolean` on `EngineState` + a gate at `placeEngineOrder` that logs would-be orders to `trader_trades` with `status='DRY_RUN'` instead of calling the broker. UI badge "DRY RUN" prominently. ~150 LOC. Defer until there's a specific change to dry-test — adds infra without immediate user-visible value.

### Live-vs-backtest divergence tracker
For each engine fill, compare against what the backtester would have predicted at the same timestamp. If divergence > 5%, log to a new `engine_divergence` table. Surfaces drift between paper backtest assumptions and live broker reality. ~200 LOC + migration. Defer until live trading is running consistently — needs enough live fills to calibrate the "expected divergence" baseline.

---

## Multi-user / social

### Signal copying (shadow trading)
User A subscribes to user B's published signals. When B's engine places an order, A's engine places the same trade proportionally to their account size. Privacy controls: B chooses whether to publish, A chooses whether to copy, with a confirmation step before each first-time copy of a new symbol. ~250 LOC + new `signal_subscriptions` schema.

**Why:** lets users with proven strategies amplify them, lets novices follow without copying manually. Sentinel becomes a platform, not just a tool.

---

## Order types / broker features

### OCO orders attached at entry
Currently the engine places a separate stop after a market buy. Alpaca supports bracket orders (entry + stop + take-profit atomically). The Alpaca client already has a `orderClass: "bracket"` code path — just unused. Wire it into the entry-order construction for paths that have known stop + TP at entry time. ~50 LOC.

**Why:** atomic — broker enforces the stop the moment the entry fills, no race window where the position is unprotected.

### Real-time websocket price feed
Replace 15-min scan + 1-min quote polling with Alpaca's websocket market data stream. Price updates push immediately; trailing stops tighten in real-time instead of on the 1-min cadence. Reduces broker API rate-limit pressure too. ~400 LOC — biggest infra change.

**Why:** sub-minute responsiveness for trailing stops on volatile names; eliminates the "stop fired at $117.67 but engine's tracked peak was $452" lag we saw with TGT.

### Engine-internal model fine-tuning
Periodically (weekly?) retrain the GA optimizer on the most recent N days of trader_trades data, refreshing the optimizer's preferred params. Adaptive to changing market regimes. Requires careful guard against overfitting to small N. Defer until live runs accumulate enough trade data. ~300 LOC + ops.

**Why:** static GA params drift out-of-distribution as market regime changes. Continuous tuning keeps the engine current.

---

## 2026-05-12 — Competitive gap analysis triage

Done a full audit comparing Sentinel against Robinhood / Webull / Wealthfront / Autopilot / eToro / IBKR. Items below were considered and **deferred** (parked here) or **declined** (won't build). Things being built next are NOT in this file — they're in commit/branch history.

### Declined — won't build

**Crypto trading.** Out of scope for this platform's positioning. Alpaca supports it, but Sentinel stays equity-focused. Reconsider if user demand shifts.

**Options trading + chain UI + Greeks.** Out of scope. Sentinel keeps options-*flow* analysis (already wired in `src/lib/hybrid/options-layer.ts`) as a signal input, but won't be an options execution venue.

### Deferred — parked for later

**User-code backtest (Python or JS).** QuantConnect / Quantopian territory. XL effort — sandbox runner, language SDK, security boundary. Wait until there's a power-user community asking for it.

**Public read-API + per-user API keys.** Same auth model as session, but key-scoped. Power-user / programmatic-dashboard / "my own bot reads my Sentinel signals." M effort. Defer until external integrations are actually requested.

**Generic outgoing webhooks.** Beyond the existing Discord-specific webhook surface — let a user wire any URL to fire on events (trade fills, signals, alerts) with HMAC-signed payloads. S effort, schema mostly exists. Pair with API-key delivery so subscribers can verify. Defer with the public API.

**Copy trading / mirror another trader.** eToro / Autopilot pattern. Subscribe to user B's signals, auto-execute proportional to your account with sizing rules. Forum + leaderboard already exist as discovery surfaces. L effort — signal pub/sub + per-follower mirror engine + execution-rate-limit + dispute handling. Defer until there's a meaningful userbase to subscribe.

**Model portfolios with auto-rebalance.** Wealthfront / Betterment pattern. "60/40 Aggressive Growth" target allocation, drift-triggered rebalance. Naturally a new engine mode. L effort. Defer until goal-based investing is shipped (it's the prerequisite UI).

**Goal-based investing.** "Retire by 50" / "House in 5 years." Entity model, recommended monthly contribution, projection chart. Pairs with recurring buys. M effort. Defer with model portfolios.

**Automated tax-loss harvesting (execute, not just identify).** Tax Center identifies harvestable lots today — *executing* the harvest as a SELL + non-substantially-identical replacement BUY is the next step. The §475(f) and wash-sale plumbing is already there from Phase 5. M effort. Defer until live trading is steady.

**Dividend tracking + ex-div calendar + DRIP enrollment.** Alpaca's `/account/activities` exposes dividends; need a calendar surface and a DRIP toggle. M effort. Useful but no one's asked.

**Level 2 / order book / time & sales.** Alpaca's SIP feed is paid ($99/mo). Order-book card on analysis page. M effort. Wait until we'd actually pay for SIP for streaming anyway.

**Sortino / Calmar / MAR ratios on backtest results.** Already have Sharpe + max DD computed; adding these three formulas is an hour each. Sortino = excess return ÷ downside-only stdev (Sharpe but only penalizing losses); Calmar = annualized return ÷ max drawdown; MAR = same formula over full track record. XS effort total. Park because it's not bundle-worthy alone — fold into a future backtest UI polish pass.

**Native iOS / Android apps.** XL — full RN / Swift / Kotlin build + App Store / Play Store ops. PWA push (already shipped) covers ~80% of use cases. Reconsider only with significant user volume.

**Real-time streaming quotes (WebSocket).** Sub-second price updates from Alpaca's IEX feed (free) or full SIP (paid). Real engine reaction-speed edge on volatile names. ~400 LOC infra change with reconnect logic + state reconciliation. M-L effort. Park here because the polling cache is good enough for current swing/optimized modes. Revisit when adding a scalp/intraday mode where it matters, or when going live and engine reaction speed becomes critical.

### Tier 4 (compliance) — mostly not applicable

As a middleware on top of Alpaca/IBKR, the broker handles ACH funding, KYC/W-9/ID verification, SIPC, PFOF disclosure, execution-quality reports, 1099s, and bond/mutual fund/international markets (if upstream adds them). Sentinel just signs the broker's REST API on the user's behalf.

What *would* still matter if commercializing multi-user:
- Formalized ToS + risk disclosure + "AI is not financial advice" page (the inline disclaimer covers most of it)
- Customer-support ticketing surface (email-only today)

Both are S effort, deferred until there's actual external user demand.

### Tier 3 explanations (for reference)

- **Sortino ratio** = excess return ÷ stdev(negative returns only). Same shape as Sharpe but doesn't penalize upside volatility. Almost always higher than Sharpe for the same strategy.
- **Calmar ratio** = annualized return ÷ max drawdown. Return per unit of peak-to-trough pain. > 3.0 is excellent.
- **MAR ratio** = same formula as Calmar but over the entire track record, not just a year. Calmar is annual MAR.

These tell you how *painful* a strategy is to hold — Sharpe alone hides the worst-day texture.

---

## 2026-05-12 — Earnings transcript AI summary (paid-tier dependency)

The `/api/transcripts/[symbol]` endpoint shipped only the *listing*
(year/quarter/date/Finnhub-id) because the full transcript text endpoint
is on Finnhub's paid alternative-data tier. To actually AI-summarize:

1. Upgrade Finnhub plan to the alternative-data tier (~$100+/mo)
2. Add `getTranscript(id)` to finnhub.ts pulling `/stock/transcript?id=…`
3. Pass the text to Anthropic Haiku with a "summarize the call: results,
   guidance, analyst Q&A surprises, management tone" prompt (~$0.003/call)
4. Cache the AI summary by transcript id (immutable once published — TTL
   forever, no invalidation needed)
5. Surface on the Analysis page intelligence tabs as a "Last call summary"
   card alongside the existing transcript listing

Defer until Finnhub upgrade is worth the spend. The metadata listing
alone surfaces "Latest call: Q3 2025, Nov 7" which is already useful
context.

## 2026-05-12 — QoL audit bigger asks: 4 of 5 shipped (Phase 6)

Shipped:
- **Compare strategies side-by-side** ✅ — see Phase 5 above. `/dashboard/backtest/compare`.
- **Real portfolio overview page** ✅ — `/dashboard/portfolio` no longer redirects to /trader. Aggregates manual portfolios + live broker positions via the existing `/api/portfolio/summary` endpoint. Sector allocation bars (color-coded by `getSymbolSector()`), top-5 winners + top-5 losers, full broker positions table.
- **Batch quote endpoint** ✅ — new `/api/quotes?symbols=AAPL,MSFT,…` returns `{ symbol → { price, change } }`. Caps at 100 symbols. Uses `getMarketDataProvider().fetchBars(2, "1d")` per symbol with Promise.allSettled so one bad symbol doesn't tank the batch. 60s response cache.
- **Trader 2-col layout on wide screens** ✅ — Open Positions + Open Orders now wrap in `grid-cols-1 2xl:grid-cols-2`, side-by-side on 2560+ screens. (The audit said "3-col with signals"; the existing signals/trades 2-col row stays as-is — practical change was the positions/orders wrap which had been a tall vertical scroll.)

Still pending:
- **Persist recently-viewed symbols to DB for cross-device.** Today `useRecentlyViewed` is localStorage-only. Would need `users.recent_symbols TEXT[]` + lightweight POST on every selection. M effort. Defer unless multi-device usage actually picks up — single-device localStorage is fine for now.

---

## 2026-05-12 — Pruned

Removed: "Path to Live Trading — Today / This Week" — referenced specific stale commits (`565fd76`, `b2a8d06`) and one-off operational items (APA short cleanup) that are no longer relevant. The "Before Live (the actual gate)" checklist remains as the still-valid pre-live gate.

---

## 2026-05-12 — UI-lie bug audit

Catalog of bugs where the UI shows a frozen / stale / drifted value while the real source-of-truth has been updating correctly. Triaged after fixing the original case (Trader page Stop column displaying the entry-time disaster stop while the real trailing stop was correctly ratcheting up on Alpaca — commit `00131db`).

### ~~Money / safeguard bugs~~ ✅ SHIPPED — Phase 1

Fixed in the Phase 1 batch (commit details below):
- Wash-sale set now refreshed on every BUY decision via `canPlaceBuyOrder()` instead of only at scan boundaries — closes the gap where a fresh losing close + immediate re-entry within the same scan would slip past protection.
- PDT state re-evaluated from a live account snapshot inside every BUY decision instead of only at scan start — a 2nd day-trade in a 15-min window now sees current state.
- `bootEquity` re-snapshot at every new trading day boundary (`bootEquitySnapshotDate` field) — the 50% equity-collapse tripwire stays calibrated as the account organically grows.
- `engine.halted` halt path now fires a synchronous (but fire-and-forget) `upsertDailyPnl(halted=true, reason)` so the dashboard reflects the halt on the next fetch instead of waiting for the next scan boundary.
- Dashboard `todayPnl` response now carries `source` (`"broker_intraday"` | `"broker_total"` | `"db_snapshot"`) + `staleSeconds` so the UI can distinguish "live broker P&L" from "DB snapshot from last scan." No more silent mixing of `unrealizedIntradayPnl` vs DB `unrealizedPnl`.

Bugs from the original list that turned out to already be mitigated and were NOT fixed (verified during the audit pass):
- `dailyNotional` does reset at midnight — every scan's date check (`engine.dailyLossDate !== today`) handles it. False positive in the original audit.
- `__brokerPositionCache` 15-min stale lag — already mitigated because the dashboard route fetches fresh broker data on every request and falls back to the cache only when broker is unreachable. `positionsStale` + `positionsAgeSeconds` already surface staleness when fallback happens.

### ~~Frozen-value bugs~~ ✅ SHIPPED (mostly) — Phase 2

Fixed in the Phase 2 batch:
- **`pos.peakPrice` reset on >5% qty drop.** `syncPositionMapFromBroker()` now detects a material qty drop (`new/old < 0.95`) and resets peakPrice to currentPrice. Trail % calculation recalibrates from the post-close size instead of an inflated peak.
- **`pos.trailingStopPct` re-resolved on every sync.** Strategy edits (trailingStopPct) now propagate to existing positions instead of being frozen at entry-time values.
- **`pos.takeProfit` re-computed from current strategy.** When the strategy's `takeProfitPct` changes, refreshed as `entryPrice × (1 + tpPct)` so existing positions reflect the new target.

Still pending:
- **`pos.entryDate` from broker creation time.** Currently set to `new Date()` when the engine discovers a position post-opening (manual buy on Alpaca, server restart). Fix requires a `getOrderByFill(symbol)` method on the broker client OR persisting the position map across restarts. Defer until hold-period math actually bites — most users don't notice the off-by-hours issue.

### ~~Cache invalidation~~ ✅ SHIPPED — Phase 3

Fixed in the Phase 3 batch:
- **`__earningsCache` / `__sentimentCache` get TTL.** New `FILTER_CACHE_TTL_MS = 6h`. `isFilterCacheStale()` helper combines the date check with timestamp age check — refresh on date change OR every 6 hours, whichever first. Server-boot-at-3am-ET no longer means 20+ hours of stale earnings data.
- **Screener cache: `scanStartedAt` separate from `scannedAt`.** New `cache.scanStartedAt: Date | null` set at scan start, cleared on completion. `/api/screener` response now exposes both. UI can render "scan in progress, started X ago" during long scans instead of "last scanned 45 min ago" the whole way through.
- **Engine cache: `engine.scanStartedAt` separate from `lastScanAt`.** Same treatment for engine scans. Exposed via `peekEngineStatus()` so the Trader page can show the in-progress state honestly.
- **`__rsCache` not exposed.** Type slot exists in `gFilters` but no read sites — left untouched.

### Dual-source divergence (medium priority)

15. **Position quantity in Open Positions vs Open Orders.** Live broker qty in Positions row, but stop order's qty (placed when position opened, frozen) shown in Orders row. Diverges on partial fills. Fix: `syncBrokerStops()` checks for qty mismatch and replaces the order.
16. **Watchlist symbol count shown in 3 places** (sidebar widget, watchlists page, analysis page header) — different sources, different caches. Fix: centralize via React Query or SWR.
17. **Win rate computed differently on Performance page vs Trader analytics card vs PerformanceWidget.** Same underlying data, three formulas. Fix: single helper in `src/lib/stats.ts`.

### Preference propagation (low priority)

18. **DisplayPrefs context change doesn't cause re-render in PositionDetailSheet** while it's open. The user toggles P&L format from sidebar; sheet behind it stays formatted in the old style until closed and reopened. Fix: verify the consumer is actually wrapped in the provider (it is) and re-renders on `pnlFormat` change (likely a stale-closure bug in `useEffect`).
19. **Active watchlist switch doesn't refresh Analysis page filters.** Switching watchlists via the sidebar doesn't update the symbols shown on the analysis cockpit until refresh.

### Timing / off-by-one (cosmetic)

20. **`finalPositions[].updatedAt` set to "now" at dashboard fetch time**, not actual position update time. "Position opened 5m ago" actually means "we fetched 5m ago." Fix: separate `fetchedAt` from `positionUpdatedAt`.
21. **`brokerConnections.lastConnectedAt` updated only after every action, not on initial connect verification.** Fix: write on first successful API call.
22. **Recent-viewed history race condition** on same-symbol double-click → can lose the most-recent stamp. Use `sql\`now()\`` in upsert.

### Dead code / structural

23. **`traderPositions` DB table defined but never written.** Either populate it (so a "position history" view becomes possible) or delete the schema entry. Currently a footgun for anyone writing a new query.
24. **`pos.stopLoss` reconciliation fix from commit `00131db` should be backported** to anywhere else that reads `pos.stopLoss` directly (audit needed — there were ~5 callsites at last check).
25. **AI trade summary frozen at PENDING.** When the trade fills, summary still describes "pending." Fix: auto-regenerate on PENDING → FILLED transition (cheap — one Haiku call per fill, ~$0.003).

**Recommended order to fix:** money bugs first (1–7), then frozen values (8–11), then caches (12–14). Dual-source and preferences can wait until they actually bite.
