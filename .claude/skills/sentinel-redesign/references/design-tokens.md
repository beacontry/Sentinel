# Sentinel Design Tokens

All values are defined in `src/app/globals.css` inside the `@theme` block (Tailwind CSS 4). Use as Tailwind utility classes.

## Color System

### Backgrounds (dark hierarchy, darkest to lightest)
| Token | Hex | Tailwind Class | Usage |
|-------|-----|----------------|-------|
| `--color-bg-primary` | `#000000` | `bg-bg-primary` | Page background, body |
| `--color-bg-secondary` | `#09090b` | `bg-bg-secondary` | Topbar, sidebar, surface alternative |
| `--color-bg-surface` | `#09090b` | `bg-bg-surface` | Card backgrounds, form sections |
| `--color-bg-elevated` | `#18181b` | `bg-bg-elevated` | Hover states, nested surfaces, skeleton base |
| `--color-bg-hover` | `#27272a` | `bg-bg-hover` | Active hover states |

### Text
| Token | Hex | Tailwind Class | Usage |
|-------|-----|----------------|-------|
| `--color-text-primary` | `#ffffff` | `text-text-primary` | Headings, primary content, values |
| `--color-text-secondary` | `#a1a1aa` | `text-text-secondary` | Descriptions, secondary labels |
| `--color-text-muted` | `#71717a` | `text-text-muted` | Placeholders, disabled text, table headers |

### Borders
| Token | Hex | Tailwind Class | Usage |
|-------|-----|----------------|-------|
| `--color-border` | `#27272a` | `border-border` | Card borders, table dividers, input borders |
| `--color-border-hover` | `#3f3f46` | `border-border-hover` | Hover border state |

### Accent (Emerald Green)
| Token | Hex | Tailwind Class | Usage |
|-------|-----|----------------|-------|
| `--color-accent` | `#10b981` | `text-accent` / `bg-accent` | Primary actions, active tabs, logo, links |
| `--color-accent-hover` | `#34d399` | `bg-accent-hover` | Button hover state |
| `--color-accent-muted` | `rgba(16,185,129,0.1)` | `bg-accent-muted` | Subtle accent backgrounds |

### Trading Semantics
| Token | Hex | Tailwind Class | Usage |
|-------|-----|----------------|-------|
| `--color-bullish` | `#34d399` | `text-bullish` / `bg-bullish` | Positive P&L, buy signals, gains |
| `--color-bullish-muted` | `rgba(52,211,153,0.1)` | `bg-bullish-muted` | Bullish badge background |
| `--color-bearish` | `#f87171` | `text-bearish` / `bg-bearish` | Negative P&L, sell signals, losses |
| `--color-bearish-muted` | `rgba(248,113,113,0.1)` | `bg-bearish-muted` | Bearish badge background |
| `--color-warning` | `#fbbf24` | `text-warning` / `bg-warning` | Caution, pending, hold signals |
| `--color-warning-muted` | `rgba(251,191,36,0.1)` | `bg-warning-muted` | Warning badge background |
| `--color-neutral` | `#71717a` | `text-neutral` | Neutral/hold state |

### Signal Strength Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--color-strong-buy` | `#059669` | Strong buy signal indicator |
| `--color-buy` | `#10b981` | Buy signal indicator |
| `--color-hold` | `#71717a` | Hold signal indicator |
| `--color-sell` | `#f87171` | Sell signal indicator |
| `--color-strong-sell` | `#ef4444` | Strong sell signal indicator |

### Opacity Patterns for Muted Backgrounds
Use Tailwind opacity modifiers for tinted backgrounds:
- `bg-accent/10` — subtle accent tint (edit mode banners, selected states)
- `bg-accent/15` — medium accent tint
- `bg-bullish/10` — bullish badge background
- `bg-bearish/10` — bearish badge background
- `bg-bearish/15` — destructive button background
- `bg-warning/10` — warning badge background
- `border-accent/20` — accent border (edit banners, active cards)
- `border-bearish/20` — destructive border
- `border-accent/50` — selected card border

## Typography

### Font Families
| Token | Font | Tailwind Class | Usage |
|-------|------|----------------|-------|
| `--font-display` | Inter | `font-display` | Page titles (rarely used separately) |
| `--font-body` | Inter | `font-body` | All body text (default) |
| `--font-mono` | JetBrains Mono | `font-mono` | Prices, percentages, quantities, code |

### Font Loading (Next.js)
```tsx
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });
```

### Type Scale
| Element | Classes | Usage |
|---------|---------|-------|
| Page title (hero) | `text-4xl font-semibold tracking-tight` | Main dashboard "Command Center" |
| Page title (standard) | `font-display text-2xl font-bold` | Most page headers |
| Page subtitle | `text-sm text-text-secondary` | Below page titles |
| Card title | `text-sm font-semibold text-text-primary` | CardTitle component |
| Modal title | `text-lg font-semibold text-text-primary` | ModalTitle component |
| Body text | `text-sm` (14px) | Default body copy |
| Small text | `text-xs` (12px) | Badges, timestamps, metadata |
| Stat label | `text-xs uppercase tracking-[0.18em] text-text-muted` | StatCard labels |
| Stat value | `text-2xl font-semibold text-text-primary` | StatCard numbers |
| Monospace data | `font-mono text-sm` | Table numbers, prices |
| Large mono value | `font-mono text-lg font-bold` | Portfolio value, key metric |

### Letter Spacing
- Body: `-0.01em` (set on body element)
- Stat labels: `tracking-[0.18em]` (wide spacing for uppercase labels)
- Page hero title: `tracking-tight`

## Spacing

### Base Scale (4px)
Sentinel uses Tailwind's default 4px spacing scale. Common values:
- `gap-1` (4px), `gap-1.5` (6px), `gap-2` (8px), `gap-2.5` (10px), `gap-3` (12px)
- `gap-4` (16px), `gap-5` (20px), `gap-6` (24px)
- `p-3` (12px), `p-4` (16px), `p-5` (20px), `p-6` (24px)
- `py-16` (64px) — empty state vertical padding

### Page-Level Spacing
- Page container: `p-4 lg:p-6 space-y-6`
- Form page max width: `max-w-3xl`
- Section gap: `space-y-6`
- Card internal gap: `space-y-4`

### Component Spacing
- Card padding: `p-5`
- StatCard padding: `p-4`
- Modal padding: `p-6`
- Input internal: `px-4 py-3`
- Button sm: `px-3 py-1.5`
- Button md: `px-4 py-3`
- Button lg: `px-6 py-3`
- Badge: `px-2.5 py-1`

## Border Radius

| Element | Class | Pixels |
|---------|-------|--------|
| Cards | `rounded-3xl` | 24px |
| StatCards | `rounded-2xl` | 16px |
| Buttons (md/lg) | `rounded-2xl` | 16px |
| Buttons (sm) | `rounded-xl` | 12px |
| Inputs | `rounded-2xl` | 16px |
| Modals | `rounded-xl` | 12px |
| Badges | `rounded-full` | pill |
| Tabs | `rounded-full` | pill |
| Inner forms/sections | `rounded-lg` | 8px |
| Logo icon | `rounded-2xl` | 16px |
| Nav items | `rounded-lg` or `rounded-xl` | 8-12px |

## Shadows

| Pattern | Class | Usage |
|---------|-------|-------|
| Card subtle | `shadow-[0_0_0_1px_rgba(255,255,255,0.02)]` | Cards, stat cards |
| Modal | `shadow-2xl shadow-black/40` | Modal dialog |
| Toast | `shadow-lg shadow-black/30` | Toast notifications |

## Animations

| Name | Duration | Easing | Transform | Tailwind Class |
|------|----------|--------|-----------|----------------|
| fade-in | 0.2s | ease-out | translateY(4px) -> 0 | `animate-fade-in` |
| scale-in | 0.15s | ease-out | scale(0.97) -> 1 | `animate-scale-in` |
| slide-up | 0.25s | ease-out | translateY(8px) -> 0 | `animate-slide-up` |
| shimmer | 1.5s | ease-in-out infinite | background-position | via inline style |
| spin | standard | linear infinite | rotate | `animate-spin` |

### Transition Patterns
- Interactive elements: `transition-colors duration-150`
- Buttons: `transition-all duration-150 ease-out`
- Sidebar slide: `transition-transform duration-200`

## Icons

- Library: `lucide-react`
- Standard size in text: `w-4 h-4`
- Header icon size: `w-5 h-5`
- Empty state icon: `w-10 h-10` to `w-12 h-12`
- Icon color follows text color of context (e.g., `text-accent`, `text-text-muted`)
- Trading icons: TrendingUp (bullish), TrendingDown (bearish), Target (accuracy)
- Navigation: LayoutDashboard, TrendingUp, Search, Wallet, Bot, Sparkles
- Brand: Shield (Sentinel logo icon)

## Scrollbar

Custom scrollbar for dark theme:
- Width: `5px`
- Track: transparent
- Thumb: `var(--color-border-hover)` (#3f3f46)
- Thumb hover: `var(--color-text-muted)` (#71717a)

## Selection

Text selection uses accent-muted background: `background-color: var(--color-accent-muted)`
