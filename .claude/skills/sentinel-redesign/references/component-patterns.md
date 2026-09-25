# Sentinel Component Patterns

All reusable components live in `src/components/ui/`. Import from there before creating anything new. Every primitive is on the token scale (`globals.css`), and `/dashboard/admin/ui-kit` renders each one in every state for screenshots and a keyboard pass.

Rules that hold across all of them:
- **44px touch floor.** Controls are `min-h-11`; a denser 36px control pads its hit area to 44px with a pseudo-element.
- **One focus ring.** The global `:focus-visible` outline in `globals.css`. Fields keep `outline-hidden` under a 2px ring, which forced-colours mode repaints.
- **State is never colour alone.** A gain or loss prints its sign and a ▲/▼ glyph; a status prints its word and an icon.
- **No card in a card.** A group inside a card is an `Inset`.

## Actions

### Button (`button.tsx`)
```tsx
import { Button } from "@/components/ui/button";

<Button variant="primary" loading={saving} disabled={!ready} disabledReason="Engine is running, stop it first">
  Place paper buy
</Button>
```
- Variants: `primary` (the one main action), `secondary`, `ghost`, `destructive` (loss triplet), `danger` (solid `bearish-solid` fill, only for the one irreversible confirm). `outline` is a deprecated alias of `secondary`.
- Sizes: `md` (default, 44px) and `sm` (36px drawn, 44px hit area; dense rows only). `lg` is a deprecated alias of `md`.
- `loading` disables, sets `aria-busy` and keeps the label. `disabledReason` prints why a disabled button is blocked and links it with `aria-describedby`.
- No default `type`: inside a form it submits, as an HTML button does.
- Icon-only: `className="w-11 px-0"` (md) or `"w-9 px-0"` (sm) plus an `aria-label`.

### ButtonLink (`button-link.tsx`)
Navigation styled as a button, on `next/link`. Never wrap a `Button` in a `Link` (invalid HTML, two tab stops).
```tsx
<ButtonLink href="/dashboard/alerts" variant="secondary">Alerts</ButtonLink>
```

### Segmented (`segmented.tsx`)
Two to five mutually exclusive choices that apply at once (side, order type, a filter). A named group of buttons carrying `aria-pressed`, styled from it.
```tsx
<Segmented
  label="Order side"
  value={side}
  onChange={setSide}
  options={[
    { value: "buy", label: "Buy", icon: "▲", tone: "bullish" },
    { value: "sell", label: "Sell", icon: "▼", tone: "bearish" },
  ]}
/>
```
`busy` disables it with `aria-busy` while its value loads; `fullWidth` stretches the options.

## Fields

### Input, Select, Textarea, SearchInput
Share `FIELD_BASE` from `input.tsx`: the card fill (`bg-bg-secondary`), the 3:1 `border-border-control` edge, `text-base sm:text-sm` (iOS does not zoom), 44px height. An `error` sets `aria-invalid` and points `aria-describedby` at the error line.
```tsx
<Input label="Limit price" type="number" inputMode="decimal" enterKeyHint="done" error={err} />
```
A field with no visible label takes an `aria-label`. Money and quantity fields use `inputMode="decimal"`.

### Toggle (`toggle.tsx`)
A checkbox drawn as a switch: solid accent track, on-accent thumb, 44px label, outline focus on the track.

## Surfaces

### Card and Inset (`card.tsx`)
- `Card`: `rounded-xl border border-border bg-bg-secondary p-5 shadow-card`. One level only.
- `Inset`: `rounded-lg bg-bg-surface p-3`, no border. Use it for a group inside a card (a summary, a tile, a nested form). Takes `as`.
- Dividers inside either: `divide-[var(--color-hairline-inner)]`.
- `CardTitle` takes `as` (`h2`, `h3`, `h4`, `p`) so the heading level fits the page.
- A clickable card is a stretched link (`after:absolute after:inset-0` on the Link, `relative` on the card), with any actions as siblings above it (`relative z-10`), visible at rest.

### Readout strips
A group of figures is one bordered strip of borderless tiles, not a card per figure:
```tsx
<dl className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-bg-secondary p-2 shadow-card sm:grid-cols-4">
  <div className="rounded-lg bg-bg-surface p-3">
    <dt className="eyebrow text-text-muted">Buying power</dt>
    <dd className="mt-1 font-mono text-xl font-semibold tabular-nums">$8,000.00</dd>
  </div>
</dl>
```
`PageIntro` stats and `src/components/trader/account-readout.tsx` are built this way.

## Money and status

### SignedValue (`signed-value.tsx`)
The way to print a gain or loss. Glyph (aria-hidden), the `formatPnl` string (U+2212 minus, unsigned zero, dollars without a basis) and a visually hidden "gain" or "loss". Colours what is displayed after rounding; `null` prints "n/a".
```tsx
<SignedValue value={pnl} basis={costBasis} format={pnlFormat} />
```
`DirectionGlyph` and `DirectionWord` do the same for a value that arrives as a preformatted string.

### StatusChip and OrderStatusChip (`status-chip.tsx`)
Tone classes from `STATUS_TONE_CLASSES` (`src/lib/status-tone.ts`), the one status map. The type requires an `icon` for the `bullish` and `bearish` tones.
```tsx
<StatusChip tone="bearish" icon={<AlertTriangle className="h-3 w-3" />}>LIVE, real money</StatusChip>
<OrderStatusChip status={order.status} />
```
`OrderStatusChip` reads `orderStatusMeta()` (`src/lib/order-status.ts`): a word, an icon and the tone from `tradeStatusTone()`. Unknown statuses keep their text, neutral.

### Badge and SignalBadge
`Badge` shares the chip shape and map (`default` is neutral); use it for chips whose word already says the state. `SignalBadge` prints ▲/▼ beside Buy and Sell; one size.

### StatCard
Eyebrow label, `text-xl` mono value; a `positive`/`negative` tone also prints ▲/▼ and a hidden word.

## States

### EmptyState (`empty-state.tsx`)
`kind`: `empty` (the only one that may offer to create), `filtered` (clear filters), `not-connected` (defaults to a Settings link). An action with `href` renders a ButtonLink; with `onClick`, a Button.

### ErrorState (`error-state.tsx`)
A failed load: `role="alert"`, a Try again button that keeps its label while retrying, and the trace ID as a reference. Never show EmptyState for a failure. `compact` for a widget or table body.

### Skeleton and LoadingRegion
`Skeleton` blocks are aria-hidden with a token sheen that shows on dark. Wrap them in `LoadingRegion label busy`, which sets `aria-busy` and announces "Loading {label}" once through a mounted status line. Size skeletons like the content they stand in for.

### LiveRegion (`live-region.tsx`)
A mounted, visually hidden `role="status"` (or `alert`) whose text changes. Never mount a live region together with its message.

### Toast (`toast.tsx`)
```tsx
const { toast } = useToast();
toast({ type: "error", message: "Order rejected: insufficient buying power", traceId });
```
Icon per kind, tone from the status map, a 44px labelled dismiss, at most three on screen, errors 10s and others 5s (`duration: 0` persists). Messages are announced through mounted polite and assertive regions.

## Navigation

### Tabs and TabPanel (`tabs.tsx`)
Underline tabs on Radix, 44px triggers, the global focus ring. `TabPanel` mounts on first show and is hidden, not unmounted, afterwards, so typed input survives a switch. Keep the active tab in the URL with `useUrlParam`.

### Nav items (`top-nav-shell.tsx`)
Styled from `aria-current="page"`; the shells start with a "Skip to content" link to `<main id="main">`.

### ConfirmActionModal / useConfirmAction
The only way to confirm destructive or money-moving actions. Tones: `danger` (default, destructive button), `primary`, `irreversible` (the solid danger fill, for a LIVE order or a book-wide liquidation). Summary rows print a direction for toned figures; `typedKeyword` gates the largest actions.

## Trading-specific

- `src/components/trader/`: the trader desk's rendering pieces (positions and orders tables with a card list below `md`, signal and trade feeds, account and P&L readouts).
- `src/components/tax/`: Tax Center and Tax Report views and the shared formatters.
- `src/components/marketing/`: landing sections (nav, pricing teaser, equity illustration).

## Patterns

### Section header anatomy
Title plus one line of description on the left (`min-w-0`, truncating), controls on the right (`shrink-0`). Dashboard widgets use this through `WidgetWrapper`.

### Tables on phones
Four or more columns: `hidden md:block` table with a sticky `thead`, right-aligned `font-mono tabular-nums` figures, plus a `md:hidden` card list (primary field as title, the rest as a meta line, actions trailing).
