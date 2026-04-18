# Sentinel Component Patterns

All reusable components live in `src/components/ui/`. Always import from there before creating new components.

## Available Components

### Button (`src/components/ui/button.tsx`)
```tsx
import { Button } from "@/components/ui/button";

// Variants: primary | secondary | ghost | destructive | outline
// Sizes: sm | md | lg
<Button variant="primary" size="md" loading={false} onClick={...}>
  Label
</Button>
```

**Variant styles:**
- `primary` — `bg-accent text-black font-semibold hover:bg-accent-hover` (main CTA)
- `secondary` — bordered, `bg-bg-surface`, hover upgrades to `bg-bg-elevated`
- `ghost` — text only, hover adds background
- `destructive` — `bg-bearish/15 text-bearish border-bearish/20`
- `outline` — bordered, similar to secondary but explicit outline style

**Size styles:**
- `sm` — `px-3 py-1.5 text-xs rounded-xl`
- `md` — `px-4 py-3 text-sm min-h-[44px] rounded-2xl` (default, touch-friendly)
- `lg` — `px-6 py-3 text-sm min-h-[48px] rounded-2xl`

**Built-in features:** Loading spinner, disabled state, `active:scale-[0.98]`, focus ring

### Card (`src/components/ui/card.tsx`)
```tsx
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

<Card hover>
  <CardHeader>
    <CardTitle>Section Title</CardTitle>
    <Button variant="secondary" size="sm">Action</Button>
  </CardHeader>
  {/* content */}
</Card>
```

**Card base:** `rounded-3xl border border-border bg-bg-surface p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]`
**Hover mode:** `hover:border-border-hover hover:bg-bg-elevated cursor-pointer`
**Selected state (add via className):** `border-accent/50`

### Badge (`src/components/ui/badge.tsx`)
```tsx
import { Badge } from "@/components/ui/badge";

// Variants: default | bullish | bearish | warning | neutral
<Badge variant="bullish">+2.5%</Badge>
```

**Variant styles:**
- `bullish` — `bg-bullish/10 text-bullish border-bullish/20`
- `bearish` — `bg-bearish/10 text-bearish border-bearish/20`
- `warning` — `bg-warning/10 text-warning border-warning/20`
- `default/neutral` — `bg-bg-elevated text-text-secondary border-border`

**Base:** `rounded-full border px-2.5 py-1 text-xs font-medium`

### SignalBadge (`src/components/ui/signal-badge.tsx`)
```tsx
import { SignalBadge } from "@/components/ui/signal-badge";

// signal: STRONG_BUY | BUY | HOLD | SELL | STRONG_SELL
<SignalBadge signal="STRONG_BUY" />
```

Maps signal types to Badge variants: STRONG_BUY/BUY -> bullish, HOLD -> neutral, SELL/STRONG_SELL -> bearish

### StatCard (`src/components/ui/stat-card.tsx`)
```tsx
import { StatCard } from "@/components/ui/stat-card";

<StatCard
  label="Total P&L"        // uppercase tracking-wide muted label
  value="$12,450.00"       // large semibold number
  subtext="+15.3%"         // optional colored subtext
  tone="positive"          // positive | negative | neutral
/>
```

**Styling:** `rounded-2xl border border-border bg-bg-surface p-4`
- Label: `text-xs uppercase tracking-[0.18em] text-text-muted`
- Value: `text-2xl font-semibold text-text-primary`
- Subtext tone: positive=`text-bullish`, negative=`text-bearish`, neutral=`text-text-secondary`

### Input (`src/components/ui/input.tsx`)
```tsx
import { Input } from "@/components/ui/input";

<Input
  label="Symbol"
  placeholder="AAPL"
  value={symbol}
  onChange={(e) => setSymbol(e.target.value)}
  error="Required field"  // optional, shows red border + message
  icon={<Search />}       // optional left icon
/>
```

**Styling:** `rounded-2xl border border-border bg-bg-surface px-4 py-3 min-h-[44px]`
- Focus: `border-accent/50 ring-1 ring-accent/30`
- Error: `border-bearish focus:ring-bearish/30`
- Label: `text-sm font-medium text-text-secondary`

### Select (`src/components/ui/select.tsx`)
```tsx
import { Select } from "@/components/ui/select";

<Select
  label="Risk Tolerance"
  options={[{ value: "moderate", label: "Moderate" }]}
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>
```

### Textarea (`src/components/ui/textarea.tsx`)
Same patterns as Input but multiline. Has `label`, `error`, `rows` props.

### Checkbox (`src/components/ui/checkbox.tsx`)
```tsx
<Checkbox label="Enable alerts" checked={enabled} onChange={setEnabled} />
```

### Toggle (`src/components/ui/toggle.tsx`)
```tsx
<Toggle label="Dark mode" checked={dark} onChange={setDark} />
```

### Modal (`src/components/ui/modal.tsx`)
```tsx
import { Modal, ModalHeader, ModalTitle, ModalFooter } from "@/components/ui/modal";

<Modal open={isOpen} onClose={() => setIsOpen(false)}>
  <ModalHeader>
    <ModalTitle>Confirm Action</ModalTitle>
  </ModalHeader>
  <p className="text-sm text-text-secondary">Are you sure?</p>
  <ModalFooter>
    <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
    <Button onClick={handleConfirm}>Confirm</Button>
  </ModalFooter>
</Modal>
```

**Overlay:** `bg-black/60 backdrop-blur-sm`
**Content:** `max-w-lg rounded-xl border border-border bg-bg-surface p-6 shadow-2xl animate-scale-in`
**Features:** Focus trap, Escape to close, click-outside to close, body scroll lock

### Tabs (`src/components/ui/tabs.tsx`)
```tsx
import { Tabs, TabPanel } from "@/components/ui/tabs";

<Tabs
  tabs={[{ id: "overview", label: "Overview" }, { id: "trades", label: "Trades" }]}
  activeTab={activeTab}
  onChange={setActiveTab}
/>
<TabPanel active={activeTab === "overview"}>...</TabPanel>
<TabPanel active={activeTab === "trades"}>...</TabPanel>
```

**Active tab:** `bg-accent text-black rounded-full`
**Inactive tab:** `bg-bg-elevated text-text-muted rounded-full`
**Container:** `overflow-x-auto` for mobile

### Pagination (`src/components/ui/pagination.tsx`)
```tsx
import { Pagination } from "@/components/ui/pagination";

<Pagination currentPage={page} totalPages={total} onPageChange={setPage} />
```

**Active page:** `bg-accent text-white rounded-lg`
**Navigation:** `h-9 w-9 rounded-lg` with ChevronLeft/ChevronRight

### Skeleton (`src/components/ui/skeleton.tsx`)
```tsx
import { Skeleton } from "@/components/ui/skeleton";

<Skeleton width="100%" height="20px" rounded="md" />
<Skeleton className="h-6 w-32" rounded="lg" />
```

Uses shimmer animation with `oklch` gradient.

### EmptyState (`src/components/ui/empty-state.tsx`)
```tsx
import { EmptyState } from "@/components/ui/empty-state";

<EmptyState
  icon={<Wallet className="w-10 h-10" />}
  title="No portfolios yet"
  description="Create your first portfolio to start trading."
  action={{ label: "Create Portfolio", onClick: handleCreate }}
/>
```

**Styling:** Centered column, `py-16 px-4`, description constrained to `max-w-sm`

### Toast (`src/components/ui/toast.tsx`)
```tsx
import { useToast } from "@/components/ui/toast";

const { toast } = useToast();
toast("success", "Trade executed successfully");
toast("error", "Failed to fetch data");
toast("warning", "API rate limit approaching");
toast("info", "New signal detected");
```

**Types:** success (bullish), error (bearish), warning (warning), info (accent)
**Position:** `fixed bottom-4 right-4 w-80`
**Auto-dismiss:** 4 seconds

### Dropdown (`src/components/ui/dropdown.tsx`)
Menu dropdown with items. Click-outside to close.

### Tooltip (`src/components/ui/tooltip.tsx`)
Hover tooltip for additional context.

### Avatar (`src/components/ui/avatar.tsx`)
User avatar with fallback initials.

### SearchInput (`src/components/ui/search-input.tsx`)
Input with search icon, designed for filter/search bars.

## Trading-Specific Components

### Signal Card (`src/components/dashboard/signal-card.tsx`)
Displays a trading signal with:
- Bullish/bearish icon with tinted background (`bg-bullish/20` or `bg-bearish/20`)
- Confidence bar: `h-1.5 bg-bg-elevated rounded-full` with colored fill
- Uses TrendingUp/TrendingDown icons

### Accuracy Badge (`src/components/dashboard/accuracy-badge.tsx`)
Shows prediction accuracy:
- `>=60%` — `text-bullish`
- `>=40%` — `text-warning`
- `<40%` — `text-bearish`
- Format: `{pct}% accuracy ({total} signals)`

### Sentiment Gauge (`src/components/dashboard/sentiment-gauge.tsx`)
SVG arc gauge for bull/bear sentiment.

## Common UI Patterns

### Page Loading State
```tsx
if (loading) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
    </div>
  );
}
```

### Inline Loading (Button)
```tsx
<Button loading={isSubmitting}>Save</Button>
```

### Success Feedback
```tsx
{saved && (
  <span className="text-sm text-bullish flex items-center gap-1">
    <Check className="w-4 h-4" /> Saved
  </span>
)}
```

### Error Display
```tsx
{error && <p className="text-sm text-bearish">{error}</p>}
```

### Color-Coded P&L
```tsx
<span className={`font-mono ${value >= 0 ? "text-bullish" : "text-bearish"}`}>
  {value >= 0 ? "+" : ""}{value.toFixed(2)}%
</span>
```

### Selected Card
```tsx
<Card
  hover
  className={selectedId === item.id ? "border-accent/50" : ""}
  onClick={() => setSelectedId(item.id)}
>
```

### Section Header with Icon
```tsx
<CardHeader>
  <div className="flex items-center gap-2">
    <Shield className="w-5 h-5 text-accent" />
    <CardTitle>Section Title</CardTitle>
  </div>
</CardHeader>
```

### Inline Empty State (inside a Card)
```tsx
<div className="text-center py-8">
  <Webhook className="w-10 h-10 text-text-muted mx-auto mb-3" />
  <p className="text-sm text-text-muted mb-1">Nothing here yet</p>
  <p className="text-xs text-text-muted">Add something to get started</p>
</div>
```

### Full-Width Empty State
```tsx
<div className="rounded-xl border border-border bg-bg-surface p-12 text-center">
  <Icon className="w-12 h-12 text-text-muted mx-auto mb-4" />
  <h3 className="font-display text-lg font-semibold mb-2">Title</h3>
  <p className="text-sm text-text-secondary max-w-sm mx-auto">Description</p>
</div>
```

### Edit Mode Banner
```tsx
{editMode && (
  <div className="rounded-2xl bg-accent/10 border border-accent/20 px-4 py-3 flex items-center gap-3">
    <Pencil className="w-4 h-4 text-accent shrink-0" />
    <p className="text-sm text-text-secondary">
      <span className="font-medium text-accent">Edit mode</span>
      {" "}&mdash; Description of what user can do.
    </p>
  </div>
)}
```

### List Item with Actions
```tsx
<div className="flex items-center justify-between p-3 rounded-lg bg-bg-elevated border border-border hover:border-border-hover transition-colors">
  <div className="flex items-center gap-3 min-w-0">
    <Icon className="w-5 h-5 text-accent shrink-0" />
    <div className="min-w-0">
      <p className="text-sm font-medium truncate">{name}</p>
      <p className="text-xs text-text-muted truncate">{subtitle}</p>
    </div>
  </div>
  <div className="flex items-center gap-1.5 shrink-0">
    <Badge variant="bullish">Active</Badge>
    <Button variant="ghost" size="sm"><Trash2 className="w-4 h-4" /></Button>
  </div>
</div>
```

### BUY/SELL Toggle Buttons
```tsx
<div className="flex gap-1">
  <Button variant={side === "BUY" ? "primary" : "ghost"} size="sm" onClick={() => setSide("BUY")}>BUY</Button>
  <Button variant={side === "SELL" ? "destructive" : "ghost"} size="sm" onClick={() => setSide("SELL")}>SELL</Button>
</div>
```

### Form Section (Nested in Card)
```tsx
<form className="mb-4 p-4 rounded-lg bg-bg-elevated border border-border space-y-3">
  <Input label="Name" ... />
  <Input label="URL" ... />
  <div className="flex gap-2">
    <Button type="submit" size="sm">Save</Button>
    <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
  </div>
</form>
```
