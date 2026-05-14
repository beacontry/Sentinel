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

### Paper vs Live: what actually differs

**The engine code path is 100% identical between paper and live.** The only places `environment` is referenced are: the Alpaca client constructor picking the base URL (`api.alpaca.markets` vs `paper-api.alpaca.markets`), `resolveBrokerClient()` enforcing the `ALLOW_LIVE_TRADING` env gate, and the engine capturing `engine.environment` for the LIVE banner / audit metadata. No environment-specific branches in order placement, position reconciliation, the Phase 3 safeguards, stop calculations, signal generation, or risk-limit loading.

That means **signals fire identically, orders are constructed identically, stops are set identically, and all five Phase 3 circuit breakers operate identically**. Paper trading is a faithful test of signal quality and risk-profile sizing.

What does NOT carry over from paper because it lives at the broker/market layer:

- **Fill rate.** Paper Alpaca fills aggressively at the limit price (`currentPrice * 1.001`). Live routes through real exchanges and will miss fills when the market moves through the limit before the order reaches the book. Expect fewer positions opened per scan in live.
- **Slippage on market sells.** Paper compresses to zero; live executes against the real bid. Stop-loss exits and trailing-stop exits will realize measurably worse than paper would show. P&L on losing trades will be worse; P&L on winners may be slightly worse too.
- **Partial fills.** Paper rarely partials. Live frequently partials on >100 share orders or on thin/wide-spread names. The engine reconciles via `syncPositionMapFromBroker()` on the next scan, so partials don't break state — but `positionMap.qty` lags the broker for up to one scan interval.
- **Order rejection.** Live broker rejects more aggressively: PDT (< $25k account + 4 day-trades in 5 business days locks the account), buying-power strictness (live includes maintenance margin requirements paper ignores), wash-sale flags, IPO restrictions, halted symbols. Each rejection becomes an `order.rejected` audit row and the engine continues to the next symbol; no halt.
- **Settlement timing.** Live equity moves with T+1 settlement on stock proceeds; paper books instantly. The account-switch detector's 50% equity-drop tripwire is intentionally generous to absorb this, but on a brutal day it could legitimately fire — that's working as designed.
- **Disaster stops (18%).** Paper fills at the stop trigger. Live executes at the next available print after the stop fires, which on volatile/illiquid names can realize > 18% loss before fill.
- **Day-trade counting / PDT.** The engine doesn't track day-trade count. On a sub-$25k live account, repeated intraday round-trips will trigger a Pattern Day Trader lock. Either keep equity > $25k in live, restrict the engine to swing modes (no intraday), or accept the eventual lock.
- **Wash sales.** Engine doesn't track. Not relevant in paper. In live, automated trading racks up wash sales quickly and complicates tax reporting unless §475(f) MTM is elected at year-start (see `~/.claude/projects/.../reference_mtm_tax_election.md`).

**Net effect:** expect live results to look like a worse, slower version of paper — same trades attempted, fewer filled, exits slightly worse. The signal/strategy/risk-profile evaluation transfers; the realized-P&L number does not. Run paper and live in parallel for at least the first week with matched risk profile but small live size to measure the paper-to-live tax for your particular signal mix.

### Rollback procedures

Three off-ramps, cheapest to most invasive. Pick the lightest one that fixes the actual problem.

**(A) Env-only rollback — "live went badly, go back to paper"**

Cheapest path. No code changes, no rebuild, no DB changes. Use when the engine made trades you regret but the code is working as designed and you just want to stop trading live.

```bash
# On the droplet — clear the env var
ssh deploy@<host>
sudo sed -i 's/^ALLOW_LIVE_TRADING=1$/ALLOW_LIVE_TRADING=/' /opt/apps/sentinel/.env

# Recreate the container (podman restart does NOT re-read env-file)
sudo podman stop sentinel-app && sudo podman rm sentinel-app
sudo podman run -d --name sentinel-app --network=host \
  --env-file /opt/apps/sentinel/.env \
  -e NODE_ENV=production -e HOSTNAME=0.0.0.0 -e PORT=3010 \
  -e NEXT_TELEMETRY_DISABLED=1 -e CACHE_DIR=/data/cache \
  -v /opt/apps/sentinel/cache:/data/cache:Z \
  --restart always -m 2g \
  ghcr.io/ixiondt/sentinel:latest
```

After: engine refuses to start on any live broker connection (emits `engine.live_blocked` audit event on attempts). Re-activate the paper connection (`isActive=true` via Settings or `UPDATE broker_connections SET is_active=true WHERE environment='paper' AND user_id=...`) and start the engine. The live connection row stays in the DB — flipping back later is just reversing this procedure.

**(B) Code revert — "Phase 3 safeguards are causing false halts" / "audit-log writes are slowing routes"**

`git revert` the offending phase, redeploy. Migrations stay applied — the new audit_log table and the Phase 3 columns in `user_risk_profiles` just sit unused. **Do not drop columns the running code still expects.**

```bash
# Local — revert phases in REVERSE order (4 → 3 → 2 → 1) if multiple
git revert ca361c2   # Phase 4: audit viewer + live-confirm modal
git revert 81aca49   # Phase 3: live-trading safeguards
git revert acbdf4a   # Phase 2: audit log foundation
git revert fc227a3   # Phase 1: strict crypto — see warning below

git push  # CI builds and ships the image; on droplet pull + recreate as in (A)
```

Dependency notes:
- Phase 4 reads from the Phase 2 audit_log table. Revert 4 before 2.
- Phase 3 introduces `engine.environment`, `engine.boot`, the safeguard helpers, and the two new risk-profile columns. Reverting 3 returns the engine to its pre-Phase-3 behavior: silent live refusal (no env gate, no LIVE banner). Acceptable; just remember `ALLOW_LIVE_TRADING` becomes irrelevant.
- Phase 2 stands alone — safe to revert in isolation if you decide audit-log instrumentation is too costly. The audit_log table itself remains in DB; rows just stop accumulating.

⚠️ **Do not revert Phase 1.** That would re-introduce `decrypt()`'s silent-plaintext fallback, which means tampered ciphertext gets silently treated as a valid plaintext API key. If you hit a real decrypt failure (e.g. after rotating `ENCRYPTION_KEY` without re-encrypting existing rows), the fix is **not** to weaken crypto — it's to delete the affected broker_connections row and re-add the connection in Settings.

**(C) Migration drop — only when the table itself is corrupted**

Almost never needed. Only justified if `audit_log` is in a state truncation can't fix (e.g. you need to free disk and don't care about history) or you're decommissioning the deployment. **Always pair with the matching code revert from (B), or `loadRiskLimits()` crashes on every scan.**

```bash
# Stop the app first
ssh deploy@<host>
sudo podman stop sentinel-app

# Drop the audit table — loses all history
sudo -u postgres psql sentinel_db -v ON_ERROR_STOP=1 -c '
  DROP TABLE IF EXISTS audit_log CASCADE;
'

# Drop the Phase 3 columns — engine falls back to code defaults
# (only safe AFTER deploying a Phase-3-reverted image)
sudo -u postgres psql sentinel_db -v ON_ERROR_STOP=1 -c '
  ALTER TABLE user_risk_profiles DROP COLUMN IF EXISTS max_daily_notional_pct;
  ALTER TABLE user_risk_profiles DROP COLUMN IF EXISTS max_consecutive_losses;
'

sudo podman start sentinel-app
```

**Lighter alternative: truncate without dropping.** If the audit_log just has too many rows or junk metadata and you want to start fresh:

```sql
TRUNCATE audit_log;
```

The next `writeAudit()` becomes the new genesis row (`prev_hash = "GENESIS"`). Don't `DELETE FROM ... WHERE id < N` to "prune" — that breaks the chain (the next row's `prev_hash` points to a deleted predecessor) and `verifyAuditChain()` will flag it forever. Truncate is the clean reset; partial delete is a one-way break unless you also rewrite every subsequent row's prev_hash + hash.

### Phase 5 — Personalized live-trading protections

Three opt-in/auto protections layered on top of the Phase 3 safeguards. All operate alongside (not instead of) the existing notional cap, rate limit, broker-failure halt, and account-switch detection.

**MTM election (Trader page → Tax election card):**
Self-attested §475(f) Mark-to-Market checkbox. Writes to existing `user_tax_status` table via `PUT /api/tax-status`. Drives **wash-sale protection** as a single switch:
- MTM unchecked (default) → wash-sale protection ON
- MTM checked → wash-sale protection OFF (MTM traders are exempt from §1091)

Engine reads `hasTraderTaxStatus` at `startEngine()`. Toggle takes effect on next engine start. While running, the wash-sale set is refreshed every 5 minutes from `trader_trades`.

**Wash-sale protection:**
Blocks BUYs on any symbol with a losing exit (`action IN ('SELL','manual_close') AND pnl < 0`) within the last **31 calendar days** (1 day past IRS 30-day for safety). Symbol-level, not lot-level — over-conservative but simpler. Caches the symbol set on engine state, single batched query per scan, O(1) check per buy. Audit reason: `wash_sale_protection`.

Does NOT catch: manual buys via Alpaca's UI (engine can't see those at order time), "substantially identical" ETFs (engine treats only exact-ticker matches), different share classes (GOOG ≠ GOOGL by engine logic).

**PDT protection:**
Auto-detected from `account.equity < $25,000`. Three behaviors:
- **At startup:** refuse to start `intraday` mode if PDT-vulnerable. Returns specific error with the equity threshold. Other modes (conservative / moderate / optimized / tactical / tactical-smart) allowed — they're swing-oriented and rarely produce same-day round-trips.
- **Mid-session re-evaluation:** every scan calls `evaluatePdtState()` against live `account.equity` and `account.daytradeCount`. Transition from not-vulnerable → vulnerable emits one `engine.pdt_vulnerable` audit event (informational, no halt) and flips the Trader page warning panel on.
- **Buy block:** when `pdtVulnerable && daytradeCount >= 3` (one shy of the PDT-flag at 4), all new BUYs blocked. Audit reason: `pdt_protection`. **SELLs always allowed** — exits override PDT.

Gate ordering inside `canPlaceBuyOrder()`: wash-sale → PDT → notional → rate-limit. Cheapest checks first; the first reason found is what's logged.

**UI surfaces (Trader page):**
- Yellow PDT warning panel: "PDT-vulnerable — X day-trades / 5d window. Y / 4 limit."
- Tax election card with MTM checkbox + wash-sale protection status badge (On / Off, blocked-symbol count).

**Recommended risk profile for $5k cash-only live account:**
- Engine mode: `conservative`, `moderate`, or `optimized` (avoid `intraday` and `tactical-smart`)
- `maxPositionPct`: 25-33% (3-4 positions max — meaningful per-trade size)
- `maxDailyLossPct`: 2% ($100/day stop)
- `maxDailyNotionalPct`: 0.5 (50% of equity / day)
- `maxConsecutiveLosses`: 3
- MTM checkbox: unchecked unless you actually filed §475(f) at last year-start

## Adaptive engine mode (8th mode, regime-driven)

`EngineMode` now includes `"adaptive"` (`src/lib/trading-engine.ts`). When a user selects adaptive, the engine reads market regime at each scan boundary (VIX + SPY trend) and sets `engine.effectiveMode` to one of `conservative` / `moderate` / `optimized` / `aggressive` / `tactical`. The user-selected mode (`engine.mode`) stays `"adaptive"`; everywhere strategy decisions are made, code goes through `getActiveMode(engine)` which returns the effective mode.

**Regime rules** (centralized in `src/lib/market-regime.ts`):
- `VIX > 28` OR `SPY < SMA50` → risk_off → `conservative`
- `VIX > 18 && <= 28` AND `SPY >= SMA50` → neutral → `moderate`
- `VIX <= 18` AND `SPY > SMA50` → risk_on → `optimized`
- `VIX <= 14` AND `SPY > SMA200` AND `breadth > 75` (live only) → strong risk_on → `aggressive`

**Never auto-selected**: `intraday` (PDT-sensitive), `tactical-smart` (already adaptive), `adaptive` itself.

**Audit:** every regime-driven mode switch writes an `ENGINE_MODE_SWITCHED` audit row with metadata `{ adaptive: true, from, to, regime, vix, spyPrice, spyMA50, reasons }`. No-op when regime stays put scan-to-scan.

**Live vs backtest:** live engine reads VIX + SPY + breadth. Backtest replays VIX + SPY only (breadth replay is expensive: 50 stocks × N days). The classifier handles missing breadth gracefully — the strong-risk-on `aggressive` bump just doesn't fire in backtest.

**Mode-compare backtest** at `/dashboard/backtest/mode-compare?symbol=AAPL` runs all 6 comparable modes (5 base + adaptive; `intraday` + `tactical-smart` excluded) against the same symbol+date-range. Stats table + equity-curve overlay + adaptive's modeTimeline visualization.

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
- **Strategy presets** are filtered to the 7 engine-runnable base modes (`conservative`, `moderate`, `aggressive`, `optimized`, `intraday`, `tactical`, `tactical-smart`) plus `adaptive` (8th, regime-driven), `custom`, and `auto` — backtest and Live Trader share the same preset universe so what you tune is what you can deploy.
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
0 12 * * 1-5 curl -fsS -H "x-cron-secret: $CRON_SECRET" https://sentinel.guardcybersolutionsllc.com/api/cron/journal-prompts?type=pre-market
0 20 * * 1-5 curl -fsS -H "x-cron-secret: $CRON_SECRET" https://sentinel.guardcybersolutionsllc.com/api/cron/journal-prompts?type=post-market
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
0 12 * * 1-5 curl -fsS -H "x-cron-secret: $CRON_SECRET" https://sentinel.guardcybersolutionsllc.com/api/cron/journal-prompts?type=pre-market
0 20 * * 1-5 curl -fsS -H "x-cron-secret: $CRON_SECRET" https://sentinel.guardcybersolutionsllc.com/api/cron/journal-prompts?type=post-market
# AI weekly review
0 22 * * 0  curl -fsS -H "x-cron-secret: $CRON_SECRET" https://sentinel.guardcybersolutionsllc.com/api/cron/journal-weekly-review
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
- `public/docs/sentinel-features.html` — note new help-text affordances

No database migrations. No deploy steps beyond the standard image rebuild.

---

## Static HTML docs (served by Next.js public/)

User-facing HTML documentation lives in **`public/docs/`** (not the repo-root `docs/` folder which holds markdown):

- `public/docs/engine-ruleset.html` — trading engine internals (kept in sync with `docs/ENGINE_RULESET.md`)
- `public/docs/sentinel-features.html` — per-page/per-feature user training reference

These render as static assets at `/docs/engine-ruleset.html` and `/docs/sentinel-features.html` on any deployment (Next.js auto-serves everything under `public/`). The repo-root `docs/` folder holds markdown source: `docs/ENGINE_RULESET.md`, `docs/future-ideas.md`. **When editing the engine ruleset, change both `docs/ENGINE_RULESET.md` AND `public/docs/engine-ruleset.html` in the same commit** — they're intentionally mirrored.

## Detailed Design Reference
For exhaustive design tokens, component APIs, and page templates, see `.claude/skills/sentinel-redesign/references/`:
- `design-tokens.md` — every color, font, spacing, shadow, animation value
- `component-patterns.md` — all component usage with code examples
- `page-templates.md` — 5 page templates, all 46 pages, responsive checklist

Invoke `/sentinel-redesign` to activate the full redesign workflow.
