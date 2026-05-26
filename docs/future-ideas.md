# Sentinel — Future Ideas

A parking lot for design ideas, deferred features, and known-but-untriaged
bugs. **Shipped work is documented in CLAUDE.md's marathon retrospective and
git history — this file is only forward-looking.**

When you ship something listed here, remove the entry. Don't leave a "✅
shipped" ghost — that's what CLAUDE.md is for. Phase status table below is
the one exception (it's the high-level tracker).

---

## Production readiness assessment (2026-05-14 EOD)

After Phases A→B→C→D→E→F→G all shipped, the platform is **revenue-capable
in Stripe sandbox** but not yet taking real money. Concrete gap list:

### Tier 1 — Blocks revenue
1. **Stripe is still in sandbox.** Activate live mode via business profile
   verification (1-2 business days). New `sk_live_` + new webhook secret +
   copy Trader/Premium products to live mode + (optional) Stripe Tax + nexus
   declarations. Replace keys in `/dashboard/admin/system-config`. Once
   approved by Stripe this is ~30 min of dashboard work.

### Tier 2 — Operational gaps (bite at first scale)
2. **No real-time error monitoring.** Sentry free tier (5K errors/mo).
   Add `@sentry/nextjs`, drop DSN in admin/system-config. 30 min setup.
3. **No uptime monitoring.** UptimeRobot or BetterUptime free tier pings
   `/api/health` every 5 min, pages on outage. 15 min setup.
4. **No backup restore drill.** Nightly `pg_dump` runs per deploy patterns
   but never test-restored. Run a restore drill on a throwaway droplet
   before there's customer data worth losing.
5. **Single container, single DB instance.** Fine for ≤100 users. Beyond
   that, plan a hot-standby PG + second app instance.
6. **No customer-facing status page.** Doesn't matter at 0 users; will at
   100+ when even short blips generate support tickets. UptimeRobot Pro
   ($5/mo) → status.beacontry.com.

### Tier 3 — Polish / conversion (defer until traction)
7. **No user-behavior analytics.** PostHog free up to 1M events. Cloudflare
   Web Analytics for traffic. ~1 hour combined.
8. **No A/B testing infrastructure.** PostHog covers this; defer until
   meaningful traffic.
9. **No referral / affiliate tracking.** Stripe Referrals or Rewardful.
   Defer until 50+ paying customers.
10. **PWA mobile not tested.** Manifest in place; nobody's installed it
    to home screen yet. Mobile-first traders care.

## Launch playbook (2026-05-14 — Phases A-G shipped; execution starts NOW)

Path from invite-only beta to first paying customer. Phases A, B, D ship
first because they unblock free-tier onboarding; Phase C (Stripe) needs
external setup (Stripe account, products, keys) before code can ship.

### What was shipped (2026-05-14)
- ✅ Phase A — public free signup (commit `169ad18`)
- ✅ Phase B — free-tier dashboard + welcome card + sidebar tier badge (`1e1749b`)
- ✅ Phase D — privacy + contact + ToS billing sections (`472b18d`)
- ✅ Phase C — Stripe end-to-end (`6e91c40`); period-end + admin-grant fixes (`62f9a7a`, `b3aaaa`)
- ✅ Phase F — admin nav hidden from non-admins (`f228266`)
- ✅ Phase E1+E2+E3 — 63 tier gates + engine tier-awareness (`700809a`)
- ✅ Phase G — paywall banners on 28 paid pages + HTML tier doc (`635902b`)

### What's left (in order)

**1. Stripe live-mode activation** (user, 30 min + 1-2 day Stripe approval).
Business profile in Stripe dashboard → identity verification → live mode
unlocks. Then `sk_live_` + new live webhook secret + Copy products to
live mode + (optional) Stripe Tax. Swap keys in `/dashboard/admin/system-config`,
optionally override price IDs via env vars.

**2. Marketing execution** (see playbook below).

**3. Operational monitoring** (Sentry + UptimeRobot — see production-readiness
section above).

### Distribution execution plan (start week of 2026-05-14)

**Week 1 — Validate the funnel (target: 5-10 free signups).**
- Tweet launch announcement, pin to profile, engage replies for 4h
- Reddit r/algotrading post with screenshots + honest pitch
- Daily digest → Twitter thread automation via Groq + Make.com / n8n
- Personal email to 5 traders you know

**Week 2-3 — First paying customer.**
- Identify 3 most-engaged free signups, comp a Trader month each
- 2 should convert when trial ends
- Reddit 2-3x/wk in r/algotrading, r/options, r/financialindependence

**Week 4 — Product Hunt launch.**
- Tuesday launch
- 5-line tagline, 3 screenshots, 90-second Loom, 5 seeded friend-comments
- Realistic: 50-200 signups + permanent backlink

**Month 2+ — Decide based on data.**
- Good retention → double down on what's working (more Reddit, IH, social)
- Bad retention → product fix first, no more marketing spend
- Good conversion (>5% free→paid) → test paid ads
- Bad conversion (<1%) → adjust paywall position

**Never (until later):**
- Paid ads before 20 paying customers + measured CAC
- SEO blog factory before organic search shows what converts
- Fancy onboarding flow before 5 actual people walked through on Loom
- Mobile app before 1000+ MAU on web


---

## Phase status (last updated 2026-05-14 pruning pass)

The 2026-05-13 UX-batch and the same-day "keep going" pass are now fully
shipped — see `CLAUDE.md § 2026-05-13` for the per-commit retrospective.
All Journal v2 phases (1–6) shipped 2026-05-13 including tagging UI,
cross-feature linking, AI weekly review cron, and tagged-pattern badges
(commits `69c5482`, `327a164`, `eec626d`, `ba1df05`). Migration `0032`
applied on prod. Cron lines added.

Round-2 compaction (2026-05-14): SignalDetails right-panel compacted
(indicators + risk 3-col tile grids, market context + what-if collapsed
by default, hybrid layers self-hide on empty, header + price merged,
side-by-side action buttons). What-If results 2x2 → 4x1 on desktop.
Reddit ticker-mention feed (Analysis → Reddit tab) shipped with admin-
configurable subreddit list at `/dashboard/admin → Reddit Feed Sources`
and migration `0033`.

## 2026-05-14 — Brand transition (Sentinel → Beacontry)

`beacontry.com` purchased + DNS / Cloudflare / Email Routing / DNSSEC
all configured. App now serves on BOTH hostnames simultaneously:
- `https://beacontry.com` (new brand — primary, all marketing / sitemap / OG)
- `https://sentinel.guardcybersolutionsllc.com` (passive legacy alias —
  still resolves so old bookmarks don't break, but no new content points
  here; can be retired when usage drops to zero)

User-visible UI rebranded across ~30 files (page titles, manifest, login,
register, terms, risk, dashboard copy, email templates, Discord embed text,
public HTML docs, outbound User-Agents to Yahoo / Finnhub / SEC / Reddit
/ congress.house.gov). Internal code names (variables, DB tables, env
vars, localStorage keys, code comments) deliberately kept as "Sentinel"
to avoid invalidating existing user prefs and breaking migrations.

### Pending actions after rebrand (status)

1. ✅ **`EMAIL_FROM` env var removed from prod droplet** (2026-05-14). The
   stale `Sentinel <noreply@guardcybersolutionsllc.com>` line was deleted
   from `/opt/apps/sentinel/.env`, container recreated (stop → rm → run
   off `ghcr.io/beacontry/sentinel:latest`). Code default
   `Beacontry <hello@beacontry.com>` now applies. `beacontry.com` is
   verified in Resend. Backup at
   `/opt/apps/sentinel/.env.bak.before-emailfrom-removal`.

2. ⏳ **Revoke the Cloudflare API token `beacontry-setup`.** Created
   2026-05-14 for the automated DNS/Email Routing setup. Token was
   pasted into chat history; revocation eliminates long-term risk.
   Profile → API Tokens → find `beacontry-setup` → Roll or Delete.

3. ⏳ **Revoke the GitHub PAT** (`ghp_oKDin...`) at
   `github.com/settings/tokens`. Used to flip repo public → private →
   public during the rebrand; no longer needed.

### Today's deploy recap (for context)

Shipped 2026-05-14 in addition to the brand transition:
- Reddit ticker mention feed (Analysis → Reddit tab) + admin-managed
  subreddit list + OAuth client-credentials path
- SignalDetails right-panel compaction (two rounds)
- Earnings page tracked-symbols chip strip + 90-day lookahead
- Hybrid Layers Reddit-sentiment chip
- Insider Activity collapse with "+N more" expand
- Various CSRF / CSP / correctness fixes from the small-wins batch
- bought beacontry.com + Cloudflare zone + Email Routing + DNSSEC + dual
  Caddy hostname serving + SSL strict
- 7 commits, ~50 files touched

Next sessions should default to checking the two pending actions above
and confirming the env var + token revocation have happened before
proposing more brand-transition work.

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

### Fractional shares (opt-in per user)
Alpaca supports fractional shares (market orders + day/ioc TIF only,
notional $ amount or fractional qty). Sentinel's broker layer at
`src/lib/brokers.ts:318-322` already handles the notional/qty
mutually-exclusive payload — the broker plumbing is there, the engine
just doesn't use it. Every BUY computes
`Math.floor(positionValue / currentPrice)` so positions round to whole
shares.

On a $30k account with 11 positions, rounding can skew a target 10%
allocation by ~4% (e.g., SNDK at $1610 = 1.92 shares rounded to 2 →
position becomes 5.4% instead of intended 5.2%). The penalty grows on
smaller accounts trading high-priced names.

Why we DIDN'T enable it across the board:
- Stops + limits require whole shares — a fractional buy means no
  broker-side stop order, position depends on the in-memory 1-min poll
- Bracket orders are rejected on fractional — entry can't atomically
  attach protective stop + take-profit
- Fractional fills make every downstream P&L calc a floating-point
  edge case

When it WOULD help, as an opt-in:
- Small accounts ($5-15k) trading high-priced names
- Equal-weight rebalancing flows where allocation precision matters
- Dollar-cost-averaging into expensive growth names

Implementation sketch:
1. `user_risk_profiles.allow_fractional` BOOL default false
2. Position sizing: `allowFractional ? (positionValue / currentPrice).toFixed(6) : Math.floor(...)`
3. Order placement: when fractional, force `type: "market"`,
   `timeInForce: "day"`, drop stops/brackets
4. `syncBrokerStops`: skip symbols where qty has decimal part
5. Trader page banner: warn that fractional positions are protected
   only by the 1-min poll (no broker-side stop)

About half a day of work. Tradeoff is real and per-user — not a global
on/off.

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

User asked 2026-05-13 whether the embedded TradingView widget could
give us L2 data for free. Short answer: no. Free TradingView gives
top-of-book (last + best bid/ask) only. Real Level 2 / Market Depth
requires one of:

| Path | Cost | Notes |
|------|-----:|-------|
| Alpaca SIP feed (above) | $99/mo per user | Already on Sentinel's broker stack; if a user is trading through Alpaca paid, the data is there to surface |
| TradingView Premium | $59.95/mo + per-exchange | Plus $24-60/mo PER exchange (NYSE OpenBook, NASDAQ TotalView). Useful in the embedded widget but billing complexity per user |
| Polygon.io paid tiers | $199/mo+ | Real-time L2, simpler API, decoupled from broker |
| IEX Cloud paid tier | varies | Their free tier stops at L1 |
| Direct exchange feeds | $500-5000/mo | Commercial-grade only |

What free retail platforms DO have:
- Their broker's native app/web (Alpaca, Schwab, IBKR) usually bundles
  real-time L2 once the user is authenticated. NOT exposed through the
  REST APIs to third parties.

Recommendation: don't build a Sentinel L2 panel. The user-experience
gain doesn't justify the per-user subscription cost — most retail
traders use L2 only on entry/exit and almost never on swing positions.
If a Sentinel user genuinely needs L2 they should view it in their
broker's app for that one ticker. We keep TradingView's free embedded
chart for charting and stay out of the data-feed-reseller business.

Revisit if (a) we add a "Pro" tier subscription, (b) Alpaca's SIP feed
becomes free or substantially cheaper, or (c) the user mix shifts
toward true intraday scalping where L2 matters per-trade.

### Native iOS / Android apps
XL — full RN / Swift / Kotlin build + App Store ops. PWA push (already
shipped) covers ~80% of use cases. Reconsider only at significant volume.

### Personal daily digest (per-user, watchlist-driven)

**What it is.** Today's daily digest (`/api/cron/market-digest`) is a
universal market overview — same content for every user. Its "Notable
signals" section is sourced from `signals` table top 10 by confidence in
the last 24h across the entire screener universe (S&P 500 + external
pushes), NOT each user's watchlist.

User noticed 2026-05-17: "is it based on stocks on my watchlist or
market overall?" Answer was: market overall, by design.

**Personal-digest concept.** Send each opted-in user a digest scoped to
THEIR watchlist symbols. Acceptance criteria:

- New route `/api/cron/personal-digest` (admin-secret like other crons)
- Loops users with `digest_email_opt_in = true`
- For each user: pull watchlist symbols via the shared resolver, fetch
  latest signal per symbol (or fresh `analyzeBars()` if stale), build
  per-user prompt
- One Groq call per user, ~$0.003/call → meaningful cost: 1,000 users
  × $0.003 × 30 days = ~$90/mo just for digests
- Email via Resend (already wired); maybe also save as an opt-in
  Article visible only to that user (would need an `audience_user_id`
  column on `articles`)
- Schedule: 9 AM ET weekdays, after the universal digest fires

**Cost / scale notes.**
- Linear in user count. At 50 paying users this is $5/mo of Groq; at
  1000 it's $90/mo. Stays cheap until thousands.
- Risk: if Groq's pricing changes or a user has a huge watchlist (50+
  symbols), the prompt token cost balloons. Cap at ~20 symbols / user.
- Trade-off vs market-wide digest: more personal but loses the "shared
  context" angle that lets community discussion reference the same
  story.

**When to ship.**
- Trigger: ~50+ paying users AND repeated requests for "tell me about
  *my* stocks." Premature before that — market-wide digest does 80% of
  the value at 1% of the cost.
- Pair with: per-user `digest_frequency` preference (daily / weekdays
  only / weekly), `digest_topic_preferences` (signals, news, earnings).
- Decision blocker: do we want a "Pro" sub-tier above Premium that
  unlocks personal digest as a perk, or is it included in Premium?
  Probably Premium-tier perk to anchor the $40/mo value.

**Not blocked on.** Personal digest doesn't require new external spend
(Groq + Resend already in place). Just engineering time + cost
modeling. Estimate: ~6 hours of work for the v1.

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
