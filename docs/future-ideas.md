# Sentinel — Future Ideas

A parking lot for design ideas, deferred features, and known-but-untriaged
bugs. **Shipped work is documented in CLAUDE.md's marathon retrospective and
git history — this file is only forward-looking.**

When you ship something listed here, remove the entry. Don't leave a "✅
shipped" ghost — that's what CLAUDE.md is for. Phase status table below is
the one exception (it's the high-level tracker).

---

## Phase status (last updated 2026-05-13 UX-batch)

Items shipped in the 2026-05-13 multi-commit UX batch (full retrospective in `CLAUDE.md § 2026-05-13`):
- CSRF: PIN-setup substring bug fixed (`10a2c18`)
- CSRF audit follow-ups: exact-path match + cookie attribute parity (`8304ecb`)
- Engine: duplicate-order from overlapping scan ticks (`11012c3`)
- Themes: 5-theme picker (light/dark/coral/light-blue/gray) (`6e67c04`)
- Performance page polling (`d79acff`)
- Earnings ticker discoverability + persistence (`c3b04ac`)
- Smart back button (Trade page) (`6c783da`)
- Analysis focus mode + chart fullscreen overlay (`32e2201`)
- Education calculator accordion + 3 missing imports (`9075cf6`)
- Articles auto-populate (daily digest → article) (`a640287`)
- Live news feed widget (`1f48b9e`)

Same-day "keep going" pass continued the batch (also shipped 2026-05-13):
- SmartBackButton rollout to articles/messages/support/forum/posts (`ca12ebd`)
- Chart fullscreen extended to Replay + Backtest (`675560a`)
- Dashboard PositionsWidget crash fix + CSP for Cloudflare Insights (`b5d4124`)
- Journal v2 phase 1 — auto-stub on filled trades + migration 0032 (`69c5482`)
- Unusual Activity ticker click → quick-info drawer (`6cb0e07`)
- Analysis layout: Signals panel removed + resizable panels + chart-fill + Make Default in watchlist dropdown (`890b9f1`)
- Journal v2 phase 2 — daily pre/post-market prompts cron (`327a164`)

Still TBD from the Journal v2 plan:
- **Phase 3** — tagging UI (symbol, strategy, emotion: greed/fear/discipline/FOMO/patience), filterable index
- **Phase 4** — cross-feature linking (Performance → journal entries for that symbol; P&L Calendar → entries for that date)
- **Phase 5** — AI weekly review cron (Sunday 5pm ET, Groq summary of week's entries + trades, stored as a `weekly-review` type entry)
- **Phase 6** — Tagged-pattern badges on journal home ("Every time you tag `FOMO`, the trade loses 70% of the time")
- **Journal page UI polish** for the new types — badge per type, sort prompts to the top while fresh, dim "filled-in" prompts, highlight unfilled ones
- **Apply migration 0032 on prod** + add the two new cron lines to the droplet crontab

## Phase status (last updated 2026-05-12 marathon)

| Phase | Theme | Shipped | Still pending |
|-------|-------|---------|---------------|
| 1 | Money bugs (UI-lie audit) | Wash-sale + PDT live refresh, bootEquity day-boundary re-snapshot, halt sync, P&L source labels | — |
| 2 | Frozen-value cleanup | peakPrice reset on partial close, trailingStopPct + takeProfit re-resolve | `pos.entryDate` from broker creation time |
| 3 | Cache invalidation | Filter-cache 6h TTL, screener/engine `scanStartedAt` | — |
| 4 | Engine intelligence | Sector exposure cap, earnings blackout, P&L heatmap widget | Engine dry-run mode |
| 5 | Strategy testing | Compare strategies side-by-side | Engine dry-run, live-vs-backtest divergence tracker, mean reversion mode |
| 6 | Frontend QoL | `/dashboard/portfolio` overview, `/api/quotes` batch, Trader 2-col XL layout | Persist recently-viewed to DB |
| 7 | LLM consolidation | All AI on Groq, admin/system-config encrypted-key UI | — |
| 8 | Adaptive engine mode | 8th `adaptive` mode wired (regime-driven base mode selection), `refreshAdaptiveMode()` at scan boundary, `/backtest/mode-compare` with regime-replay backtester, status banner shows effective mode + regime | User-tunable regime thresholds, per-sector adaptive, mode-flapping debounce |

**Large unbuilt scopes still tracked here:**
options trading module (XL — separate product), real-time WebSocket quotes
(M-L), copy trading (L), mean-reversion engine mode (L), user-code backtest
sandbox (XL), public read-API + per-user API keys (M), generic outgoing
webhooks (S), native iOS/Android apps (XL), bonds/MFs/international
(upstream-gated), earnings transcript AI summary (paid-tier-gated).

---

## Engine: deferred capabilities

### ~~Adaptive mode auto-switching~~ — Phase 8, shipped 2026-05-12
8th `"adaptive"` mode now wired: regime classifier at `src/lib/market-regime.ts`,
`refreshAdaptiveMode()` runs at every scan boundary, audit rows on every
regime-driven swap. Backtester is regime-aware via optional
`marketContext: { spyBars, vixBars }`. `/dashboard/backtest/mode-compare`
runs all 6 comparable modes side-by-side. Still pending:
user-tunable regime thresholds (currently hardcoded VIX 18/28), per-sector
adaptive, mode-flapping debounce.

### Engine dry-run mode
Add `dryRun: boolean` to `EngineState` + a gate at `placeEngineOrder` that
logs would-be orders to `trader_trades` with `status='DRY_RUN'` instead of
hitting the broker. UI shows a "DRY RUN" badge prominently. Lets users test
strategy changes against live signals without risk. ~150 LOC. **Defer**
until there's a specific change to dry-test.

### Live-vs-backtest divergence tracker
On each engine fill, compare against what the backtester would have
predicted at the same timestamp. If divergence > 5%, log to a new
`engine_divergence` table. Surfaces drift between paper assumptions and
live broker reality. ~200 LOC + migration. **Defer** until live trading is
running consistently — needs enough live fills to calibrate baseline.

### Mean-reversion engine mode
New `oversold-bounce` mode alongside momentum modes. Entry: RSI < 30 +
price > SMA200 + above-avg volume. Exit: RSI > 55 OR time-stop 10 days.
Diversifies engine edge — momentum underperforms in choppy markets, mean
reversion thrives there. ~250 LOC, biggest engine change. **Defer** until
momentum-only is profitable in paper.

### Momentum-weighted position sizing in backtester
Currently the optimizer's backtester uses fixed 10% per position. Allocate
proportional to momentum score (matches how tactical-smart sizes live).
Closer to real trading behavior; may find strategies that pair better with
high-momentum concentration. ~80 LOC. **Defer** — incremental improvement.

### OCO/bracket orders at entry
Engine places a separate stop after market-buy fills. Alpaca supports
atomic brackets — code path exists in `placeBrokerOrder` (`orderClass:
"bracket"`) but unused for engine entries. Atomic stop = no race window
where the position is unprotected. ~50 LOC. **Defer** — current race
window is narrow because stops fire on the next 1m poll.

### Real-time WebSocket price feed
Replace 5m/1m poll + 1m quote refresh with Alpaca's WebSocket stream.
Price updates push immediately; trailing stops tighten on real-time tick
instead of on the next poll. Reduces rate-limit pressure. ~400 LOC —
biggest infra change. **Defer** until scalp/intraday mode demands it.

### Continuous GA retraining
Periodically (weekly?) retrain the optimizer on the most recent N days of
`trader_trades`, refreshing the GA's preferred params. Adaptive to regime
shifts. Needs careful overfitting guard. ~300 LOC + ops. **Defer** until
live runs accumulate enough trade data.

### `pos.entryDate` from broker order creation
Currently set to `new Date()` when the engine discovers a position post-
opening (manual buy on Alpaca, or after a server restart). Fix needs a
`getOrderByFill(symbol)` method on the broker client OR persistent
position-map state across restarts. **Defer** — hold-period math is mostly
cosmetic; most users won't notice the off-by-hours issue.

---

## Operations: deferred

### Slack / Discord / email notifications beyond digest
Webhook destinations attached to audit-log events. Subscribe to
`engine.halted`, `engine.live_blocked`, `order.rejected`, `auth.login_failed`,
`engine.position_disappeared`. Per-user webhook config in a new table; admin
can also configure system-wide channels for halt events. Hooks into existing
Resend infra for email. ~200 LOC + migration. **Defer** — daily digest +
Discord webhooks (already shipped) cover the bulk of "monitor from phone."

---

## Multi-user / social: deferred

### Signal copying (shadow trading)
User A subscribes to user B's published signals; when B's engine places an
order, A's engine places the same trade proportionally. Privacy controls
on both sides + confirmation step. ~250 LOC + `signal_subscriptions`
schema. **Defer** until there's a userbase to subscribe.

### Per-user AI key overrides
Today the LLM key is server-wide (`system_config.GROQ_API_KEY`, shared by
every user). For a future multi-tenant scenario where one tenant insists
on their own quota, add a per-user override layer:

```ts
// Proposed: src/lib/db/schema/user-ai-keys.ts
user_ai_keys (
  user_id UUID FK users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,            // e.g. "GROQ_API_KEY"
  value_encrypted TEXT NOT NULL, // AES-256-GCM
  updated_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, key)
);

// getLlmApiKey(userId?) — check user override first, fall back to system_config
async function getLlmApiKey(userId?: string): Promise<string | null> {
  if (userId) {
    const userKey = await getUserConfig(userId, "GROQ_API_KEY");
    if (userKey) return userKey;
  }
  return getConfig("GROQ_API_KEY"); // existing system-wide path
}
```

Settings page card per-user shows "Use my own key" toggle + paste input
(same Test-before-save UX as admin/system-config). Cost: ~150 LOC + new
table + migration. **Defer** until multi-tenant onboarding actually needs
it — single-tenant Sentinel is fine on the global key.

---

## Order types & broker features: deferred

(Bracket orders + WebSocket feed are listed under Engine above —
they're more engine-shape than broker-shape changes.)

### Generic outgoing webhooks (beyond Discord)
Let a user wire any URL to fire on events (trade fills, signals, alerts)
with HMAC-signed payloads. Schema partly exists for Discord. Pair with the
public-API plan so subscribers can verify. S effort. **Defer.**

---

## Paid-tier features (blocked on external spend)

### Earnings transcript AI summary
`/api/transcripts/[symbol]` ships the *listing* only. Full transcript text
is on Finnhub's paid alternative-data tier (~$100+/mo). To complete:
1. Upgrade Finnhub
2. Add `getTranscript(id)` to `finnhub.ts`
3. Pass text to `groqChat()` with a "summarize results / guidance / Q&A /
   tone" prompt (~$0.003/call)
4. Cache by transcript id (immutable once published — TTL forever)
5. Surface on Analysis-page intelligence tabs as a "Last call summary" card

Park until Finnhub upgrade is worth the spend.

### Real-time SIP feed (Level 2 / order book)
Alpaca's SIP feed is $99/mo. Order-book panel on Analysis page. M effort.
Pair with WebSocket quotes — both need SIP.

### Native iOS / Android apps
XL — full RN / Swift / Kotlin build + App Store ops. PWA push (already
shipped) covers ~80% of use cases. Reconsider only at significant volume.

---

## Competitive gap analysis (parking lot)

Audit done against Robinhood / Webull / Wealthfront / Autopilot / eToro /
IBKR. Items here were considered and either **declined** (won't build) or
**deferred** (parked).

### Declined — out of scope

- **Crypto trading.** Sentinel stays equity-focused. Reconsider only if
  user demand shifts.
- **Options execution venue.** Options-flow analysis (`hybrid/options-
  layer.ts`) stays as a *signal input*. Options chain UI + Greeks +
  multi-leg orders would be a sibling product, not a feature — see the
  parked Options Trading Module (below).

### Deferred — parked

- **User-code backtest sandbox** (Python/JS). QuantConnect territory. XL
  — sandbox runner + language SDK + security boundary. Wait for power-user
  demand.
- **Public read-API + per-user API keys.** Key-scoped auth model.
  Power-user / programmatic-dashboard use case. M effort. Defer until
  external integrations are requested.
- **Copy trading / mirror trader.** See "Signal copying" above.
- **Model portfolios + auto-rebalance.** Wealthfront / Betterment
  pattern. New engine mode. L effort. Defer until goal-based investing
  ships (prerequisite UI).
- **Goal-based investing.** "Retire by 50" / "House in 5 years."
  Recommended monthly contribution + projection chart. Pairs with
  recurring buys. M effort.
- **Automated tax-loss harvesting (execute, not just identify).** Tax
  Center identifies harvestable lots today; executing the SELL +
  non-substantially-identical replacement BUY is the next step. §475(f)
  + wash-sale plumbing already there from Phase 5. M effort. Defer until
  live trading is steady.
- **Dividend tracking + ex-div calendar + DRIP enrollment.** Alpaca's
  `/account/activities` exposes dividends. Calendar surface + DRIP toggle.
  M effort. Useful but no one's asked.
- **Bonds / mutual funds / international markets.** Depends on Alpaca
  upstream coverage.

### Options Trading Module (XL — sibling product)

A separate product targeting premium-selling options traders (theta gang)
— wheel / premium-harvest / credit-spread / IV-crush mechanical
strategies. Different mental model, different math, different broker
calls. Would share Sentinel's infrastructure (auth, broker layer,
dashboard shell, watchdog) but have its own data model, signal pipeline,
risk math, exit logic, and engine modes. Historical options data is paid
($30+/mo Polygon end-of-day minimum), so the GA optimizer would be blind
without that spend.

**Suggested phasing** (if/when scoped): (1) read-only positions tracking,
(2) manual order helpers, (3) automated wheel, (4) backtest + more
strategies once options data is wired. Don't bundle with equity engine
work; ship as a sibling module behind a feature flag.

Park here at the entry-level scope. Detailed design notes will move to
`docs/options-module.md` if/when scoped.

---

## Compliance (mostly broker-handled)

As middleware on top of Alpaca/IBKR, the broker handles ACH funding,
KYC/W-9/ID verification, SIPC, PFOF disclosure, execution-quality reports,
1099s, and upstream market expansion. Sentinel just signs the broker's
REST API on the user's behalf.

What *would* still matter for multi-tenant commercialization:
- Customer-support ticketing surface — **shipped** (`/dashboard/support`)
- ToS + Risk Disclosure click-through — **shipped** (`/terms`, `/risk`,
  click-through modal)
- "AI is not financial advice" inline disclaimers — **shipped** on every
  AI surface

---

## Pre-live trading checklist

The actual gate before flipping `ALLOW_LIVE_TRADING=1`. Order matters —
don't skip ahead.

- **60 trading days of clean paper.** No manual restarts. No
  `engine_alerts` rows for `stall` or `broker_disconnect`. No
  daily-loss halts that didn't auto-recover. If something does fire, fix
  it and reset the clock.
- **External health monitoring.** UptimeRobot (or similar) pointed at
  `https://<domain>/api/health/engine`. In-process watchdog can't catch
  "container is dead entirely" — only an outside prober can.
- **Refuse to trade when `brokerConnected=false`.** Currently the engine
  keeps going on stale prices when Alpaca is unreachable. Not urgent for
  paper; matters for live.
- **Backoff on Alpaca rate limits.** 500-symbol scans + per-position
  `replaceOrder` calls can burst-hit 200 req/min. Token-bucket wrapper
  around the broker client.
- **Position-size ramp.** First 30 days live at `positionPct = 1/5` of
  paper (e.g. 3% if paper is 15%). Ratchet up if nothing breaks.
- **Tested DB backup restore.** Untested backups aren't backups. Dry-run
  restore to a scratch instance once before going live.

---

## Journal v2 — design sketch (user-flagged 2026-05-13)

Today's `/dashboard/journal` is a free-form text editor with no
opinionated structure. User reported "the journal itself doesn't seem
to have a role" — meaning it's underutilized because it asks too much
(write anything in this empty box) and gives back too little.

Design direction (not yet implemented — discuss before coding):

### Make the journal earn its slot
1. **Auto-generated trade entries.** Every `traderTrades` fill creates a
   journal stub prefilled with: symbol, entry price, exit price (or "open"),
   P&L, strategy params, signal that fired. User just adds the WHY
   (thesis, emotion, lesson). Zero friction to start; the blank-canvas
   barrier disappears.
2. **Daily prompts.** Pre-market (8:30 ET): "What's your plan today? Any
   bias to fight?" Post-close (4:30 ET): "What worked / didn't? Notable
   lesson?" Two-question stubs auto-create as draft entries the user
   can ignore or fill in. Habit formation > occasional brilliance.
3. **Tagging.** `symbol`, `strategy`, `emotion` (greed/fear/discipline/
   FOMO/patience), `outcome` (win/loss/breakeven). Searchable + filterable.
4. **Cross-feature linking.** Performance attribution row → click symbol
   → opens journal entries for that symbol. P&L Calendar day → click →
   journal entries for that date. Journal entry header shows linked
   trades inline (no need to context-switch to find what trade you're
   reviewing).
5. **AI weekly review.** Each Sunday, generate a summary: "Week in
   review — 4 wins / 2 losses, net +$X. Notable lesson from your TGT
   entry on Tuesday: 'overweighted scalp on a thin signal.' Patterns
   to watch: 3 of 6 trades were entries in the last hour of the day —
   consider if that's deliberate." Costs ~$0.01/user/week on Groq.
6. **Tagged-pattern surfaces.** "Every time you tag `FOMO`, the trade
   loses 70% of the time." Surfaced as a quiet badge on the journal
   home + on the AI weekly review. Behavioral feedback loop the user
   doesn't currently get from anywhere.

### Data model sketch
- New `journal_entries` table: `id, userId, createdAt, updatedAt, body
  (markdown), tags (jsonb), linkedTradeIds (jsonb), linkedDate (date,
  nullable for free-form), type ('trade' | 'pre-market' | 'post-market'
  | 'weekly-review' | 'free-form')`.
- New `journal_entry_links` join table for many-to-many trade↔entry if
  jsonb gets unwieldy.
- AI weekly review stored as a regular entry with `type='weekly-review'`
  so it appears inline with manual entries and can be edited.

### Implementation phases (rough)
1. Schema + auto-stub generation on `traderTrades.status='FILLED'`
2. Daily-prompt cron at 8:30 + 4:30 ET (skip if user already wrote one)
3. Tagging UI + filterable index
4. Cross-feature linking (Performance, P&L Calendar)
5. AI weekly review cron (Sundays 5pm ET)
6. Tagged-pattern badges on journal home

Phases 1-2 alone would make the journal feel useful. 3-6 are
follow-ups.

---

## Open UI-lie / drift bugs (medium-low priority)

Catalog of bugs where the UI shows a frozen / stale / drifted value while
the source of truth is updating correctly. Phase 1–3 closed the
money-impacting ones (wash-sale/PDT live refresh, peakPrice reset, filter-
cache TTL, scanStartedAt separation) — see CLAUDE.md retrospective. The
items below remain open.

### Dual-source divergence

- **Position quantity in Open Positions vs Open Orders.** Live broker qty
  in the Positions row, but stop order's qty (placed when position opened,
  frozen) shown in Orders row. Diverges on partial fills. Fix:
  `syncBrokerStops()` checks for qty mismatch and replaces the order.
- **Watchlist symbol count shown in 3 places** (sidebar widget,
  watchlists page, analysis page header) — different sources, different
  caches. Fix: centralize via React Query or SWR.
- **Win rate computed differently** on Performance page vs Trader
  analytics card vs PerformanceWidget. Same underlying data, three
  formulas. Fix: single helper in `src/lib/stats.ts`.

### Preference propagation

- **DisplayPrefs context change doesn't cause re-render in
  PositionDetailSheet** while it's open. User toggles P&L format from
  sidebar; sheet behind it stays in old format until closed and reopened.
  Likely a stale-closure bug in `useEffect`.
- **Active watchlist switch doesn't refresh Analysis page filters.**
  Switching watchlists via the sidebar doesn't update the symbols shown
  on the analysis cockpit until refresh.

### Timing / off-by-one (cosmetic)

- **`finalPositions[].updatedAt` set to "now" at dashboard fetch time,**
  not actual position update time. "Position opened 5m ago" actually
  means "we fetched 5m ago." Fix: separate `fetchedAt` from
  `positionUpdatedAt`.
- **`brokerConnections.lastConnectedAt` updated only after every action,**
  not on initial connect verification. Write on first successful API
  call.
- **Recent-viewed history race condition** on same-symbol double-click —
  can lose the most-recent stamp. Use `sql\`now()\`` in upsert.

### Dead code / structural

- **`traderPositions` DB table defined but never written.** Either
  populate it (so a "position history" view becomes possible) or delete
  the schema entry. Currently a footgun for anyone writing a new query.
- **`pos.stopLoss` reconciliation fix from `00131db` should be
  backported** to anywhere else that reads `pos.stopLoss` directly. ~5
  callsites at last check.
- **AI trade summary frozen at PENDING.** When the trade fills, summary
  still describes "pending." Auto-regenerate on PENDING → FILLED
  transition (~$0.003 / fill on Groq, basically free).
