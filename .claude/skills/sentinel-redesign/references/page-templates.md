# Sentinel Page Templates

Standard layouts and responsive patterns for all Sentinel dashboard pages.

## App Architecture

- **Root layout** (`src/app/layout.tsx`): Loads Inter + JetBrains Mono fonts, sets dark color scheme
- **Dashboard layout** (`src/app/dashboard/layout.tsx`): `flex flex-col h-screen` with Topbar + scrollable main area
- **Main content**: `flex-1 min-h-0 overflow-y-auto` — the scrollable content area below the topbar

## Navigation

### Topbar (`src/components/layout/topbar.tsx`)
- Height: `h-14`
- Background: `bg-bg-secondary border-b border-border`
- Quick nav items (always visible): Home, Analysis, Screener, Portfolio, Trader, AI
- Dropdown groups for additional pages: Markets, Trading, Social, Education, Settings
- Active state: `bg-accent/10 text-accent ring-1 ring-accent/20`
- Inactive state: `text-text-muted hover:text-text-primary hover:bg-bg-surface`

### Logo
```tsx
<div className="w-8 h-8 rounded-2xl bg-accent/15 ring-1 ring-accent/20 flex items-center justify-center">
  <Shield className="w-4 h-4 text-accent" />
</div>
```

## Page Layout Templates

### Template 1: Standard Page (Most Common)
Used by: Portfolio, Alerts, News, Forum, Journal, most pages

```tsx
export default function PageName() {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Page Title</h1>
          <p className="text-sm text-text-secondary">Short description</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md">Secondary</Button>
          <Button size="md">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New</span> Item
          </Button>
        </div>
      </div>

      {/* Content sections */}
      <Card>
        <CardHeader>
          <CardTitle>Section</CardTitle>
        </CardHeader>
        {/* ... */}
      </Card>
    </div>
  );
}
```

### Template 2: Hero Dashboard Page
Used by: Main dashboard (Command Center)

```tsx
export default function DashboardPage() {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Command Center</h1>
          <p className="mt-1 text-text-secondary">Tagline describing the page.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="md">...</Button>
          <Button size="md">...</Button>
        </div>
      </div>

      {/* Widget grid or stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="..." value="..." subtext="..." tone="positive" />
      </div>

      {/* Main content */}
    </div>
  );
}
```

### Template 3: Form/Settings Page
Used by: Settings, Create Strategy

```tsx
export default function SettingsPage() {
  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="text-sm text-text-secondary">Description</p>
      </div>

      {/* Section card with form */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-accent" />
            <CardTitle>Section Name</CardTitle>
          </div>
        </CardHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Field" ... />
            <Select label="Option" ... />
          </div>
          <Button onClick={handleSave} loading={saving}>Save</Button>
        </div>
      </Card>
    </div>
  );
}
```

### Template 4: Detail/Analysis Page
Used by: Stock analysis, Article view, Thread view

```tsx
export default function DetailPage() {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header with key info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">AAPL</h1>
            <p className="text-sm text-text-secondary">Apple Inc.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SignalBadge signal="BUY" />
          <Button variant="secondary" size="sm">Watchlist</Button>
        </div>
      </div>

      {/* Tabs for content sections */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab panels */}
      <TabPanel active={activeTab === "overview"}>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1">Main content</div>
          <div className="w-full lg:w-80 space-y-4">Sidebar stats</div>
        </div>
      </TabPanel>
    </div>
  );
}
```

### Template 5: Data Table Page
Used by: Screener, Trades, Positions

```tsx
export default function TablePage() {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Screener</h1>
          <p className="text-sm text-text-secondary">Filter and find stocks</p>
        </div>
        <div className="flex items-center gap-2">
          <SearchInput ... />
          <Button variant="secondary" size="sm">Filters</Button>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-2">
        <Tabs tabs={filterTabs} ... />
      </div>

      {/* Data table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-left">
                <th className="px-5 py-3 font-medium">Symbol</th>
                <th className="px-5 py-3 font-medium text-right">Price</th>
                <th className="px-5 py-3 font-medium text-right">Change</th>
                <th className="px-5 py-3 font-medium">Signal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border/50 hover:bg-bg-elevated transition-colors">
                  <td className="px-5 py-3 font-medium">{item.symbol}</td>
                  <td className="px-5 py-3 font-mono text-right">${item.price}</td>
                  <td className={`px-5 py-3 font-mono text-right ${item.change >= 0 ? "text-bullish" : "text-bearish"}`}>
                    {item.change >= 0 ? "+" : ""}{item.change}%
                  </td>
                  <td className="px-5 py-3"><SignalBadge signal={item.signal} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <span className="text-sm text-text-muted">{total} results</span>
          <Pagination ... />
        </div>
      </Card>
    </div>
  );
}
```

## All Dashboard Pages (33 total)

```
dashboard/                    — Command Center (widget grid)
dashboard/alerts/             — Alert management
dashboard/analysis/           — Stock analysis
dashboard/articles/           — Articles list
dashboard/articles/[slug]/    — Article detail
dashboard/backtest/           — Strategy backtesting
dashboard/calculator/         — Position calculator
dashboard/calendar/           — Economic calendar
dashboard/chat/               — AI chat analysis
dashboard/correlation/        — Asset correlation matrix
dashboard/currency/           — Currency converter
dashboard/education/          — Learning resources + glossary
dashboard/feed/               — Activity feed
dashboard/filings/            — SEC filings browser
dashboard/forum/              — Discussion forum
dashboard/forum/[threadId]/   — Thread detail
dashboard/heatmap/            — Market heatmap
dashboard/insights/           — Market insights
dashboard/journal/            — Trading journal
dashboard/news/               — News aggregator
dashboard/paper-trading/      — Paper trading simulator
dashboard/performance/        — Performance analytics
dashboard/pnl-calendar/       — P&L calendar view
dashboard/policy/             — Platform policies
dashboard/portfolio/          — Portfolio management + trading
dashboard/posts/              — Social posts
dashboard/posts/[postId]/     — Post detail
dashboard/relative-strength/  — Relative strength analysis
dashboard/screener/           — Stock screener
dashboard/settings/           — User settings
dashboard/strategies/         — Strategy management
dashboard/tax/                — Tax reporting
dashboard/tax-center/         — Tax center (harvesting)
dashboard/trader/             — Automated trader dashboard
```

## Responsive Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| Default (mobile) | 0-639px | Single column, stacked layouts |
| `sm:` | 640px+ | 2-column grids, inline header buttons |
| `md:` | 768px+ | 2-3 column grids, table visibility |
| `lg:` | 1024px+ | Side-by-side panels, full navigation, wider padding |
| `xl:` | 1280px+ | 4-column grids, expanded layouts |

## Responsive Checklist (Every Page Must Pass)

1. **Page padding**: `p-4 lg:p-6` — never bare `p-6`
2. **Header stacking**: `flex flex-col sm:flex-row sm:items-center justify-between gap-3`
3. **Button touch targets**: All buttons `min-h-[44px]` (Button md/lg handle this)
4. **Button text hiding**: `<span className="hidden sm:inline">Create</span> New`
5. **Form grids**: `grid-cols-1 sm:grid-cols-2` — never bare `grid-cols-2`
6. **Content grids**: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` — mobile-first column count
7. **Side-by-side panels**: `flex-col lg:flex-row` — never below `lg:`
8. **Tables**: wrapped in `overflow-x-auto` container
9. **Tabs/filters**: container has `overflow-x-auto`
10. **No fixed widths without breakpoint**: Never `w-[400px]` — use `w-full lg:w-[400px]`

## Test at These Widths
- **360px** — small Android
- **390px** — iPhone 14/15
- **768px** — iPad portrait
- **1024px** — iPad landscape / small desktop
- **1280px** — standard desktop
