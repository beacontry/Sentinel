# Sentinel Design Tokens

Every value lives in `src/app/globals.css` (Tailwind CSS 4). The `@theme` block is the light theme and the source Tailwind generates utilities from; each other theme is one `html.<name>` block that redefines the same names. Colour values are OKLCH. This file lists **roles**, not values: read the numbers from `globals.css`, and measure any change with `tests/unit/theme-contrast.test.ts`.

## Themes

| Theme | Class on `<html>` | Surfaces | Accent |
|---|---|---|---|
| light | none (the `@theme` block) | near-white on green-grey, hue 163 | emerald, dark fill with a white label |
| dark (default) | `dark` | green-tinted ladder, hue 163 | emerald, light fill with a dark label |
| coral | `coral` | warm light ladder, hue 40 | orange-coral (hue 40), white label; loss is coral's own darker crimson (hue 10) so the accent never reads as a loss |
| light-blue | `light-blue` | cool light ladder, hue 250 | blue, white label |
| gray | `gray` | the dark ladder with no tint | emerald |

Colour-blind mode is a second class, `colorblind`, beside the theme class. It swaps only the state colours: gain becomes blue, loss a vermillion orange and warning yellow, each moved in lightness until it clears 4.5:1. Warning moves too because the theme's amber sat on top of the orange loss; the contrast test holds loss and warning at least 0.10 deltaE OK apart.

Each block sets its own `color-scheme`, so native controls, scrollbars and the select popup follow the theme. `meta theme-color`, `public/manifest.json` and `THEME_META.pwaColor` are hex copies of each theme's `--color-bg-primary`; `tests/unit/theme-meta.test.ts` keeps them in step.

## Colour roles

### Surfaces (a lightness ladder, about +3.5 L per step on dark)
| Token | Class | Use |
|---|---|---|
| `--color-bg-primary` | `bg-bg-primary` | page |
| `--color-bg-secondary` | `bg-bg-secondary` | cards, inputs |
| `--color-bg-surface` | `bg-bg-surface` | inset areas, chart canvas |
| `--color-bg-elevated` | `bg-bg-elevated` | menus, selects, popovers |
| `--color-bg-hover` | `bg-bg-hover` | hover and selected rows |

### Edges
| Token | Class | Use |
|---|---|---|
| `--color-border` | `border-border` | decorative container edge, ~1.3:1 on purpose |
| `--color-border-hover` | `border-border-hover` | hovered container |
| `--color-border-control` | `border-border-control` | the edge of an input, select, toggle or checkbox: 3:1 or better on every surface (WCAG 1.4.11) |
| `--color-hairline-inner` | `divide-[var(--color-hairline-inner)]` | dividers inside a container |

### Text
`text-text-primary`, `text-text-secondary`, `text-text-muted`. All three clear 4.5:1 on every surface, including `bg-hover`, in every theme.

### Accent
| Token | Use |
|---|---|
| `--color-accent` / `--color-accent-hover` | the primary action fill, links, active state |
| `--color-on-accent` | the label on an accent fill. **Never `text-white`**: on the dark themes the accent is light |
| `--color-accent-muted` | a 12-15% tint for selected backgrounds |
| `--color-focus` | the global focus ring (set to the accent) |

The landing `ld-*` names (`bg-ld-deep`, `text-ld-accent`, …) point at these app tokens; they are aliases, not a second palette.

### Trading states
| Need | Classes |
|---|---|
| a gain/loss figure on a card | `text-bullish` / `text-bearish` (`text-warning` for caution) |
| a chip, badge or banner | `STATUS_TONE_CLASSES[tone]` from `src/lib/status-tone.ts`: `border-X-line bg-X-fill text-X-fg` |
| an icon tile | `STATUS_TONE_FILL_CLASSES[tone]` |
| a trade or order status | `tradeStatusTone(status)` → a tone for `<Badge variant>` |
| the one irreversible confirm | `bg-bearish-solid text-on-bearish` |

Do not build state colour from alpha (`bg-bearish/10`, `border-warning/30`): the style ratchet counts those and the count only goes down. Colour is never the only carrier; print the state in words or with a ▲/▼ glyph.

### Charts
Charts are canvas, so `src/lib/chart-theme.ts` reads the tokens and passes each through `resolveColor()` (the browser paints it into a 1x1 canvas and reads back `rgba()`), because the chart library cannot parse `oklch()` or `color-mix()`. Indicator lines use the categorical `--color-series-1` … `6`. Key a chart on `${theme}:${colorBlindMode}` to re-theme it live. Axis text is `CHART_FONT_SIZE` (12px).

## Type scale

Seven steps, 12px floor. Tailwind's own steps are reset, so `text-3xl` and up compile to nothing.

| Class | Size | Line height | Use |
|---|---|---|---|
| `text-xs` | 12px | 1.6 | metadata, badges, table headers |
| `text-sm` | 14px | 1.6 | body in the app |
| `text-base` | 16px | 1.5 | marketing body, inputs below `sm` (stops iOS zoom) |
| `text-lg` | 20px | 1.3 | card and modal titles that lead |
| `text-xl` | 24px | 1.3 | key figures |
| `text-2xl` | 32px | 1.15 | page titles |
| `text-display` | clamp(40-56px) | 1.15 | marketing headings only |

- Uppercase kicker labels use the `eyebrow` utility (12px, 600, 0.08em). Write sentence case in the source. A hand-rolled `uppercase tracking-[…]` is counted by the style ratchet and may only go down.
- Fonts: Geist Sans for display and body, Geist Mono (`font-mono`) for every financial number, with `tabular-nums`.
- A label that does not fit at 12px on a phone is hidden below a breakpoint (`hidden sm:inline`), never shrunk.

## Radius

| Class | Size | Use |
|---|---|---|
| `rounded` | 4px | tiny marks: swatches, heatmap cells, tags |
| `rounded-md` | 6px | nav items, segmented buttons |
| `rounded-lg` | 8px | buttons, inputs, dropdowns |
| `rounded-xl` | 12px | cards, modals, panels |
| `rounded-full` | pill | badges, chips, avatars |

`rounded-sm`, `rounded-2xl` and larger no longer exist.

## Elevation

`shadow-card`, `shadow-pop` (menus, popovers, hover lift) and `shadow-modal`. Each is set per theme through `--elevation-*`: the dark themes give cards no shadow, because the lightness ladder already shows depth.

## Motion

- Entrances: `animate-fade-in` (0.2s), `animate-scale-in` (0.2s), `animate-slide-up` (0.25s), `animate-fade-in-up` (0.5s, marketing), `stagger-1` … `8`. All use `cubic-bezier(0.16, 1, 0.3, 1)`.
- Transitions name their properties: `transition-colors`, or `transition-[background-color,border-color,color,transform]` when a hover moves the element, or `transition-[width,background-color]` on a progress-bar fill. `transition-all` is at zero and stays there.
- The reduced-motion block at the end of `globals.css` covers everything.

## Spacing

Tailwind's 4px scale. Page container `p-4 lg:p-6 space-y-6`; card padding `p-4 lg:p-5`; section gap `space-y-6`.

## Icons

`lucide-react`. `w-4 h-4` inline, `w-5 h-5` in headers. An icon next to a state is `aria-hidden` and the state is also in text.

## Guards

| Check | What it holds |
|---|---|
| `tests/unit/theme-contrast.test.ts` | every meaningful pair, 5 themes × colour-blind mode |
| `tests/unit/design-scales.test.ts` | seven sizes, three radii, three elevations, resets in place |
| `npm run lint:style` (`scripts/style-ratchet.mjs`) | off-token class patterns may only go down; off-scale sizes stay at zero |
| `scripts/codemods/tokenize-classes.mjs` | moves ad-hoc classes onto the tokens, one family at a time |
