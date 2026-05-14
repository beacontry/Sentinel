# Audit batch — 2026-05-13 (beginner-friendliness + correctness)

**Goal:** make Sentinel friendlier for someone new to trading, fix code-correctness footguns surfaced by a parallel multi-agent audit, and re-verify CSRF (which has regressed multiple times in the past).

**Verdict:** 387 unit tests pass · `tsc --noEmit` clean · no new CSRF bypasses · 19 files touched · no database migrations.

---

## 1. CSRF (defensive — no known active exploit, but flagged by user as recurring footgun)

| File | Change | Why |
|------|--------|-----|
| `src/app/api/auth/logout/route.ts` | Logout now also clears the `csrf-token` cookie | Old token persisted after logout; minor info-leak ("user was logged in"). More practically: a user logging in as a different account would have the stale token blow up the first mutating request with 403 until `/api/csrf` rotated. |
| `src/components/csrf-init.tsx` (`pathIsCsrfExempt`) | Strip a single trailing slash before set-lookup | A trailing `/` on an auth route (`/api/auth/login/` via a redirect chain or proxy) would slip out of the exemption set; the patched fetch would inject a CSRF header that login doesn't validate → 403. Now `/api/auth/login/` and `/api/auth/login` both resolve to exempt. |

**Re-audit done:** all 75 mutating route files under `src/app/api/**/route.ts` confirmed using `requireAuthWithCsrf` / `validateTraderSecret` / documented exemption. No new bypasses.

---

## 2. Code correctness

| File | Change | Why |
|------|--------|-----|
| `src/components/dashboard/tradingview-chart.tsx` | `Math.random().toString(36).slice(2,8)` → `crypto.randomUUID().slice(0, 8)` for the container ID | One of nine `Math.random()` hits in the audit; the other eight are inside the GA optimizer where pseudo-random is correct. Crypto-grade IDs are required by the project's own CLAUDE.md rule. |
| `src/app/api/broker/connections/route.ts` (GET) | Wrapped in `withTimeout(3000)` + 504 path with `X-Query-Timeout: true` header on statement-timeout | Last unwrapped GET route in the codebase. Without a timeout, a slow DB query would hang the whole connection until the user gave up. |
| `src/lib/optimizer.ts` (`fetchAllBars` progress callback + final failure handler) | `.catch(() => {})` → `.catch((err) => logger.warn/error)` | Optimizer runs sometimes appeared "stuck" in the admin UI when the progress writes were silently failing. Now we'll see why. |
| `src/lib/notifications.ts` (push + email best-effort) | Two outer `try {}` blocks now log on catch + the inner `.catch(() => {})` on the actual `sendPushToUser` / `sendAlertEmail` calls now logs the underlying error | Resend rate limits, expired browser push subscriptions, missing API keys — all of these used to fail silently. Best-effort policy preserved (one user's stale subscription doesn't block the notify pipeline), but failures are now visible. |
| `src/components/layout/broker-switcher.tsx` | Raw `setInterval` (POLL_MS=15s) → `usePolling` hook | usePolling pauses on `document.hidden` (Page Visibility API). Background dashboard tabs were burning two API requests every 15s for hours. |
| `src/app/dashboard/admin/page.tsx` | Raw `setInterval(loadEngines, 30_000)` → `usePolling` hook | Same fix. The admin page is the last raw-interval offender; every other dashboard interval already goes through the shared hook. |

---

## 3. Beginner-friendly UX (the bulk of the change)

### New primitives

| File | What |
|------|------|
| `src/components/ui/help-tip.tsx` (NEW) | `<HelpTip>` — a tiny `?` icon-button that opens a Radix Tooltip with a one-line explanation. Also exports `<FieldLabel>` for label + tip + optional hint composition. |
| `src/components/ui/input.tsx` | Added optional `help` prop. When set, renders a HelpTip next to the label. Backward-compatible — every Input without `help` looks identical. |
| `src/components/ui/select.tsx` | Same `help` prop. |

**Caveat:** `help` requires a `<TooltipProvider>` ancestor (already mounted in `src/app/dashboard/layout.tsx`). Don't pass `help` from `/login` / `/register` — they're outside the provider tree. Today nothing does; the prop is opt-in.

### Help text wired into existing forms

**Trader risk profile** (`src/app/dashboard/trader/page.tsx`) — every one of the 7 risk-override fields:

- Account Size, Max Daily Loss %, Max Drawdown %, Max Position %, Max Position Size, Max Single Trade Loss, Max Exposure × equity

Each tip is one sentence explaining (a) the concept and (b) a typical value range for new traders.

**Manual Order ticket** (`src/app/dashboard/trade/[symbol]/page.tsx`):

- Order Type field: HelpTip + dropdown labels expanded ("Market — fill now at current price", "Limit — only fill at my price or better", etc.)
- Time-in-Force field: same pattern ("Day — expires at market close", "GTC — good until I cancel", etc.)
- Limit Price + Stop Price: each carries a HelpTip explaining what the price means and where to set it relative to market.

**Backtest** (`src/app/dashboard/backtest/page.tsx`):

- Stop Loss %, Trail Stop %, Take Profit %, Hold Period — each has a HelpTip with concept + typical values.
- Auto-tune (⚡) button now has a hover Tooltip explaining ATR-based tuning.

**Strategy Builder** (`src/app/dashboard/strategy-builder/page.tsx`):

- Stop Loss %, Take Profit %, Max Hold (days) — same HelpTip treatment.

### Empty states with CTAs

Replaced flat "No X yet" plain-text with explanatory text + next-action links:

| Page | Before | After |
|------|--------|-------|
| Trader → Recent Signals | "No signals yet" | "Signals appear here once the engine scans your watchlist. Start the engine above, or browse the **Screener** for ideas." |
| Trader → Recent Trades | "No trades yet" | "Trades show here after the engine fires a BUY/SELL. New to this? **Browse the Education hub →**" |
| Alerts → rules list | "No alert rules yet" | One-line explanation + **Create your first alert** button that opens the form |
| Alerts → history | "No alerts triggered yet" | Adds "When one of your rules fires, the event appears here and (if enabled) goes to email / push." |
| Performance | "No performance data yet" / "Run analyses and wait 24h" | "Performance shows accuracy of signals and trades you've taken. Run the engine for a few sessions, or close manual trades, and stats appear here within 24 hours." + **Go to Trader →** link |
| Feed | "Be the first to share a signal! Analyze a stock from your dashboard and click Share." | Adds explicit link to **Analysis page** |

### Better error messages

Generic "Save failed", "ATR computation failed", "Order submission failed" → include the underlying reason from the API error envelope when present, plus an actionable nudge:

| Before | After |
|--------|-------|
| "Save failed" | "Couldn't save strategy: \<server reason\>" or "Couldn't save strategy (HTTP 503). Try again, or check if you're still signed in." |
| "ATR computation failed" | "Auto-tune failed: \<reason\>. The symbol may not have enough price history." |
| "Order submission failed" | "Order couldn't reach the broker (\<error message\>). Check your connection and retry." |

Same pattern in `src/app/dashboard/backtest/page.tsx`, `src/app/dashboard/strategies/page.tsx`, and `src/app/dashboard/trade/[symbol]/page.tsx`.

---

## 4. Documentation updates

| File | Change |
|------|--------|
| `CLAUDE.md` | New `## 2026-05-13 (audit batch)` retrospective section. Documents every change above with rationale. |
| `public/docs/sentinel-features.html` | Footer version bumped to 2026-05-13. Trader page section now mentions help icons on the risk panel. Manual Trade Ticket section now mentions HelpTips on Order Type / TIF / prices. Backtest section now mentions field tooltips + auto-tune tooltip. |
| `docs/audit-batch-2026-05-13.md` (NEW, this file) | User-review report of every change. |

`docs/ENGINE_RULESET.md` and `public/docs/engine-ruleset.html` — **not touched** (no engine logic changed; only the help-text affordances around it).

---

## 5. What was audited but found to be fine

For completeness — these were spot-checks the audit ran that found no actionable issues:

- **All 26 `JSON.parse()` call sites** — every one is wrapped in try/catch with a fallback.
- **All `setTimeout(..., abort)` + `fetch(...)` patterns** — every one has `clearTimeout` in a `finally` block. No leaks on throw.
- **All POST/PATCH/PUT request bodies** under `src/app/api/**/route.ts` — every one uses Zod `safeParse()` before reading.
- **`String.slice()` without length check** — all 10 found are on validated/parsed data (e.g. date strings, enum values). No silent-empty-string bugs like the historic `authHeader.slice(7)` foot-bullet.
- **Hardcoded `text-black` on accent backgrounds** in `calendar/page.tsx` and `filings/page.tsx` — initially flagged as "invisible in dark mode" but on inspection the accent color stays emerald/coral/blue across all 5 themes (per `globals.css` lines 25-217), so black on accent has the same contrast in every mode. No fix needed.
- **All design-token rules** — no `rounded-[22px]+`, no gradient backgrounds on UI surfaces, no side-stripe borders, no gradient text. CLAUDE.md anti-patterns are well-enforced.
- **Responsive patterns** — all pages use `p-4 lg:p-6` headers, `flex-col sm:flex-row`, mobile-first grid baselines, `overflow-x-auto` on tables. Excellent baseline.

---

## 6. Known build-time wart (environmental, not caused by this batch)

`npx next build` on Node 24.15.0 crashes with `TypeError: Cannot read properties of undefined (reading 'length')` deep inside `WasmHash._updateWithBuffer` in webpack5. This is a known incompatibility between Node 24's V8 WebAssembly changes and the bundled webpack5 in Next.js 15.3. It reproduces on a clean checkout with no changes. CI runs Node 20 LTS where it doesn't trip. `tsc --noEmit` and `npx vitest run` both pass cleanly.

---

## 7. Rollback

Nothing in this batch is risky. Each change is additive (`help` props are optional, HelpTip is a new component, empty-state text is presentational, etc.). If any individual change misbehaves, `git revert <sha>` is safe.

Files touched (verbatim list, paste-friendly for `git diff`):

```
src/app/api/auth/logout/route.ts
src/components/csrf-init.tsx
src/components/dashboard/tradingview-chart.tsx
src/app/api/broker/connections/route.ts
src/lib/optimizer.ts
src/lib/notifications.ts
src/components/layout/broker-switcher.tsx
src/app/dashboard/admin/page.tsx
src/components/ui/help-tip.tsx
src/components/ui/input.tsx
src/components/ui/select.tsx
src/app/dashboard/trader/page.tsx
src/app/dashboard/trade/[symbol]/page.tsx
src/app/dashboard/backtest/page.tsx
src/app/dashboard/strategies/page.tsx
src/app/dashboard/strategy-builder/page.tsx
src/app/dashboard/alerts/page.tsx
src/app/dashboard/performance/page.tsx
src/app/dashboard/feed/page.tsx
public/docs/sentinel-features.html
CLAUDE.md
docs/audit-batch-2026-05-13.md (this file)
```
