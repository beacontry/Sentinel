# Sentinel — Trading Intelligence Platform

## Tech Stack
- Next.js 15.3 + React 19 + TypeScript
- Tailwind CSS 4 (uses `@theme` block in globals.css, NOT tailwind.config.ts)
- Drizzle ORM + PostgreSQL
- Anthropic SDK for AI chat analysis
- Lucide React icons
- Lightweight Charts (TradingView) for charting
- Vitest for testing (88 tests across indicators, analyzer, validators, signal translator)
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
- **Engine** calls `analyzeHybrid()` → `analyzeBars(symbol, bars, signalParams?)` — passes optimizer-tuned signal params in "optimized" mode
- **Optimizer** uses `analyzeSignalOnly()` — lightweight variant with same logic, accepts tunable `SignalParams`
- **Screener** calls `analyzeHybrid()` → `analyzeBars()` with default params (shared resource, not per-user)
- `SignalParams` (emaFast, emaSlow, rsiOversold, rsiOverbought) flow through `HybridPipelineOptions.signalParams`

### Screener (Shared)
The screener scans market data and is shared across users (not user-specific). It pushes actionable signals (BUY/STRONG_BUY, confidence ≥ 0.6) to the engine via `pushExternalSignal()`. Signals are in-memory, expire after 30 minutes. Optimization runs are admin-only but results (strategy params) are shared globally.

### Broker Connections
Each user has their own broker connection (`brokerConnections` table, scoped by `userId`). The engine resolves the active connection for the authenticated user via `resolveBrokerClient(userId)`.

## Design System

### Theme: Dark-first, emerald-tinted neutrals (OKLCH)
All tokens defined in `src/app/globals.css` `@theme` block using OKLCH color space. Neutrals are tinted toward brand hue (165 = emerald). Use Tailwind utility classes — never raw hex/oklch values.

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

## Dashboard Pages (33 total)
Located at `src/app/dashboard/*/page.tsx`: alerts, analysis, articles, backtest, calculator, calendar, chat, correlation, currency, education, feed, filings, forum, heatmap, insights, journal, news, paper-trading, performance, pnl-calendar, policy, portfolio, posts, relative-strength, screener, settings, strategies, tax, tax-center, trader

## Detailed Design Reference
For exhaustive design tokens, component APIs, and page templates, see `.claude/skills/sentinel-redesign/references/`:
- `design-tokens.md` — every color, font, spacing, shadow, animation value
- `component-patterns.md` — all component usage with code examples
- `page-templates.md` — 5 page templates, all 33 pages, responsive checklist

Invoke `/sentinel-redesign` to activate the full redesign workflow.
