# Sentinel / Beacontry UI redesign plan

The plan is grounded in `C:/Users/Avalon/dev/Sentinel-review` at `fcf362a`. Every contrast figure below was computed with an OKLCH to sRGB script. The script is at `C:/Users/Avalon/AppData/Local/Temp/claude/C--Users-Avalon-dev-lab/9d6b2ae6-d444-43e9-bbea-fdc39115ae81/scratchpad/ok.mjs`: `node ok.mjs cr "L C H" "L C H"` prints a contrast ratio and `node ok.mjs tohex "L C H"` prints a hex value.

## Findings from this pass (not in the input list)

1. **The phone landing page scrolls sideways.** In `sentinel-mobile.png` at 390px, the headline ("Scan. Signal. Exec…"), the eyebrow chip, the body copy and the "What Beacontry does" card are all cut off on the right. In `src/app/page.tsx:273` the hero grid has no column template below `lg`. So its implicit `auto` track takes the min-content width of its widest unbreakable child. The likely child is the monospace uppercase chip at :276. Fix: `grid-cols-[minmax(0,1fr)] lg:grid-cols-[1.1fr_0.9fr]`, and let that chip wrap.
2. **The analysis page's Focus mode button does nothing.** `src/app/dashboard/analysis/page.tsx:137-155` toggles `html.focus-mode`. The rule that class drives, `globals.css:317`, hides `aside[data-app-sidebar]`. No element with that attribute exists any more; the shell is now the top nav `header[data-app-topnav]`. Either point the rule at `header[data-app-topnav]` or remove the button.
3. **The light, coral and light-blue themes also fail on the primary action.**
   - Light: `#10b981` behind a white label is 2.54:1.
   - `--color-ld-accent #059669` has L 59.6%, which is in the 55-60% band where neither a white nor a near-black label reaches 4.5:1. With white it measures 3.77:1.
   - Light-blue: `#3b82f6` behind white also fails.
4. **The Skeleton sheen cannot be seen on dark themes.** `skeleton.tsx` uses a literal `rgba(0,0,0,0.04)`.
5. **Two P/L formatters disagree.** `formatPnl` in `display-prefs-provider.tsx:239` writes a hyphen `-`. `trader/page.tsx:500` builds its own string with U+2212 `−`. There should be one formatter.
6. **`/api/quotes?symbols=` already exists** (`src/app/api/quotes/route.ts`), with no side effects. It is the right target for the broken `/api/analyze?symbol=` callers in the order ticket and watchlists. It is better than `/api/analyze/[symbol]`, which writes a signal row and fires alerts.
7. **The shell is missing basic accessibility.**
   - No skip link, no `id="main"`, and no `aria-current` in `top-nav-shell.tsx`.
   - The mobile hamburger is 40px (`h-10 w-10`, :148) and ignores the safe-area inset.
   - Drawer items are about 32px tall (`py-1.5 text-[13px]`, :406).
8. **Current counts, to use as the ratchet baseline:**

   | Pattern | Count |
   |---|---|
   | `text-[8-11px]` | 370 |
   | `rounded-[…]` | 56 (41 of them `rounded-[10px]`) |
   | `rounded-2xl/3xl` | 17 |
   | `shadow-[…]` | 15 |
   | `text-white` | 50 |
   | `transition-all` | 96 |
   | `focus(-visible):outline-none` | 29 |
   | raw `<button` | 149 |
   | `backdrop-blur` | 9 |
   | `-[#hex]` | 4 |
   | inline `fontSize` 8-11 | 6 |

9. **Test harness constraints.** Vitest runs in the `node` environment and only picks up `tests/**/*.test.ts`. CI (`.github/workflows/deploy.yml`) runs lint, tsc, `docs:check` and test. `scripts/capture-readme-assets.mjs` already imports `playwright`, but Playwright is not in devDependencies.

## Order of work

**Land Stage 4a first, as its own PR, before any visual change.** It covers the order-ticket environment race, the engine envelope unwrap, the engine-mode picker and the risk-override save. These are real-money correctness bugs, they are independent of the redesign, and the visual stages should not hold them up.

After that, run Stages 1 to 3 on `redesign/ui` as small PRs:
- 1a tokens
- 1b codemod plus ratchet
- 2 primitives
- 3a shell plus trader
- 3b order ticket
- 3c dashboard home plus watchlists
- 3d tax center
- 3e landing plus login

Stage 4b, the remaining behaviour fixes, can land in parallel.

**Before any change, take baseline screenshots** with `scripts/capture-redesign.mjs` (spec in Verification). Cover every route in Stage 3 at 390x844 and 1440x900, full page, in all 5 themes plus colour-blind mode.

---

## Stage 1: Token foundation

**Files:** `src/app/globals.css`, `src/lib/chart-theme.ts`, `src/app/layout.tsx` (theme-color meta), `src/components/theme-provider.tsx` (the `pwaColor` values in `THEME_META`), `public/theme-init.js` (unchanged, but confirm), plus new `scripts/style-ratchet.mjs`, `scripts/style-ratchet.baseline.json`, `scripts/codemods/tokenize-classes.mjs` and `tests/unit/theme-contrast.test.ts`.

### 1.1 Keep the utility names and change the values

There are about 1,300 uses of `bg-bg-secondary`, `text-bullish` and similar across `src`. Renaming them is pure churn. So:
- Keep every existing `--color-*` name.
- Rewrite the values in OKLCH.
- Add the new role tokens.
- Keep the class-based theming (`html.dark`, `.coral`, `.light-blue`, `.gray`, `.colorblind`), because `theme-init.js` and ThemeProvider already apply it before first paint.
- The light values stay in `@theme`, because Tailwind generates utilities from there. Each class block overrides the same names and sets its own `color-scheme`.

**New tokens, added to `@theme` and to every theme block:**
- `--color-on-accent`
- `--color-border-control` (control edges, 3:1 or better)
- `--color-hairline-inner` (dividers inside a container)
- A triplet per state: `--color-{bullish,bearish,warning}-fg`, `-fill`, `-line`
- `--color-bearish-solid` and `--color-on-bearish`, used only for the irreversible confirm action
- `--color-skeleton-sheen`
- `--color-focus` (set to the accent)

**Dark (`html.dark`), hue 163:**

```css
html.dark{
  color-scheme: dark;
  --color-bg-primary:   oklch(17% 0.020 163);   /* #07120d */
  --color-bg-secondary: oklch(20.5% 0.024 163); /* cards, inputs */
  --color-bg-surface:   oklch(24% 0.028 163);
  --color-bg-elevated:  oklch(27.5% 0.031 164); /* menus, selects */
  --color-bg-hover:     oklch(31% 0.033 164);
  --color-border:       oklch(30% 0.030 165);   /* containers only: 1.32:1 on secondary */
  --color-border-hover: oklch(36% 0.032 165);
  --color-border-control: oklch(55% 0.035 165); /* 3.74 on secondary, 3.07 on elevated */
  --color-hairline-inner: rgb(255 255 255 / 0.045);
  --color-text-primary:   oklch(96% 0.006 165); /* 15.9 on secondary */
  --color-text-secondary: oklch(76% 0.028 165); /* 6.9 on elevated */
  --color-text-muted:     oklch(68% 0.026 165); /* 5.15 on elevated, 4.56 on hover */
  --color-accent:       oklch(70% 0.15 162);
  --color-accent-hover: oklch(76% 0.15 162);
  --color-on-accent:    oklch(17% 0.020 163);   /* 7.63 at rest, 9.46 on hover */
  --color-accent-muted: color-mix(in oklch, var(--color-accent) 15%, transparent);
  --color-bullish: oklch(72% 0.16 160);          /* 7.69 on secondary */
  --color-bearish: oklch(68% 0.19 25);           /* 5.66 */
  --color-warning: oklch(78% 0.15 75);           /* 8.71 */
  --color-bullish-fg: oklch(84% 0.09 160);  --color-bullish-fill: oklch(27% 0.05 160);  --color-bullish-line: oklch(74% 0.12 160); /* fg on fill 9.4 */
  --color-bearish-fg: oklch(84% 0.088 22);  --color-bearish-fill: oklch(27.5% 0.046 22); --color-bearish-line: oklch(74% 0.14 22);  /* 8.9 */
  --color-warning-fg: oklch(86% 0.10 80);   --color-warning-fill: oklch(28% 0.045 75);  --color-warning-line: oklch(74% 0.12 75);
  --color-bearish-solid: oklch(58% 0.20 25); --color-on-bearish: oklch(98% 0.005 25);
  --color-skeleton-sheen: color-mix(in oklch, var(--color-text-primary) 6%, transparent);
  --shadow-card: none; --shadow-pop: 0 8px 24px oklch(0% 0 0 / .45); --shadow-modal: 0 16px 48px oklch(0% 0 0 / .55);
}
```

**Light (default `@theme`), hue 163 at low chroma, replacing the slate hue 256:**
- Backgrounds:
  - `--color-bg-primary: oklch(96.5% 0.006 163)` (#f0f5f2)
  - `--color-bg-secondary: oklch(99.5% 0.003 163)`
  - `--color-bg-surface: oklch(98% 0.004 163)`
  - `--color-bg-elevated: oklch(95% 0.007 163)`
  - `--color-bg-hover: oklch(92% 0.010 163)`
- Borders:
  - `--color-border: oklch(90% 0.010 163)`, 1.32:1
  - `--color-border-control: oklch(60% 0.015 163)`, 3.87 on secondary and 3.39 on elevated
- Text:
  - Primary `oklch(22% 0.02 163)`, 15.6
  - Secondary `oklch(38% 0.02 163)`, 8.6
  - Muted `oklch(47% 0.02 163)`, 5.35 on hover
- **Accent: move the fill rather than the label.**
  - `--color-accent: oklch(50% 0.12 163)` with `--color-on-accent: oklch(99.5% 0.003 163)` is 5.48:1. It is 4.81 on elevated.
  - Hover goes darker: `oklch(45% 0.11 163)` is 6.82:1.
- State colours:
  - Bullish `oklch(48% 0.12 160)`, 5.99
  - Bearish `oklch(52% 0.19 27)`, 6.00
  - Warning `oklch(50% 0.13 65)`, 6.11
  - Triplets: bullish fg/fill `oklch(38% 0.09 160)` / `oklch(95% 0.03 160)` is 8.3; bearish `oklch(42% 0.14 25)` / `oklch(95% 0.025 22)` is 7.8.
  - Shadows: `--shadow-card: 0 1px 2px oklch(20% 0.02 163 / .06)`.

**Gray (dark):** use the dark ladder at chroma 0 to 0.004. It is labelled "true neutral", so it deliberately stays untinted, and it keeps the emerald accent and on-accent. `--color-border-control: oklch(55% 0.004 0)` measures 3.56 on `oklch(22% 0.004 0)`.

**Coral and light-blue:** use the light ladder with the neutrals' hue moved to 30 or 250, at chroma 0.006.
- Coral accent `oklch(52% 0.17 30)`, 5.90 with a white label. Hover `oklch(47% 0.16 30)`.
- Light-blue accent `oklch(50% 0.19 262)`, 6.15. Hover `oklch(45% 0.19 262)`.
- Both keep white `--color-on-accent`.

**Colour-blind blocks:**
- Dark and gray: bullish `oklch(70% 0.13 240)` is 6.77 and bearish `oklch(76% 0.15 70)` is 8.07.
- Light themes: bullish `oklch(48% 0.13 245)` is 6.35 and bearish `oklch(52% 0.14 55)` is 5.70. The current Wong orange `#E69F00` fails on white; `oklch(58% …)` measures only 4.41.
- Add fg/fill/line triplets for both.

**Rewrite every `-muted` alpha token** as `color-mix(in oklch, var(--color-x) 12%, transparent)`. Every override sits on `<html>`, so each mix picks up that theme's value.

**Landing tokens (`--color-ld-*`):** drop the separate purple-black ladder (hue 285, `#0a0a0f`). Point each `ld-*` name at the matching app token, for example `--color-ld-deep: var(--color-bg-primary)` and `--color-ld-accent: var(--color-accent)`. This removes a whole parallel palette without touching markup. `--color-ld-cyan` has no role in the app; delete it after the Stage 3e grep confirms it is unused.

**Also in `globals.css`:**
- Replace the hardcoded scrollbar and `::selection` hex/rgba values with tokens.
- Update the `<meta name="theme-color">` in `layout.tsx` and `THEME_META.pwaColor` to the new page backgrounds, using `node ok.mjs tohex`.

### 1.2 Type, radius and shadow scales

Put these in `@theme` in `globals.css`.

- **Type, 7 steps with a 12px floor:** `--text-xs: .75rem` (12), `--text-sm: .875rem` (14), `--text-base: 1rem` (16), `--text-lg: 1.25rem` (20), `--text-xl: 1.5rem` (24), `--text-2xl: 2rem` (32), and `--text-display: clamp(2.5rem, 5vw + 1rem, 3.5rem)` for marketing only. Each gets its `--text-*--line-height`: 1.6 for xs and sm, 1.5 for base, 1.3 for lg and xl, 1.15 for 2xl and display.
  - This moves `text-lg` from 18 to 20 (76 sites), `text-xl` from 20 to 24 (55) and `text-2xl` from 24 to 32 (29). That is intended, and the screenshot diff will show it.
  - Only after the codemod has removed `text-3xl/4xl/5xl` (13/3/1 sites), add `--text-*: initial;` before the definitions. **Build hazard:** once the namespace is reset, an unmapped `text-3xl` silently renders at inherited size. The ratchet script must assert zero uses of any size that is not in the scale.
- **Radius:** `--radius-md: 6px`, `--radius-lg: 8px`, `--radius-xl: 12px`, plus full. Reset `--radius-*: initial` first so `rounded-2xl`, `rounded-3xl` and `rounded-sm` stop existing.
- **Shadow:** `--shadow-card`, `--shadow-pop` and `--shadow-modal` (values per theme, above), exposed as `shadow-card`, `shadow-pop` and `shadow-modal`. Reset `--shadow-*: initial`.
- **Eyebrow utility:** `@utility eyebrow { font-size: var(--text-xs); font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }`. This replaces the `text-[11px] uppercase tracking-[0.2em]` pattern in `page-intro.tsx` and `stat-card.tsx`.

### 1.3 Global base rules

Add to `@layer base`:

```css
:where(button,a,input,select,textarea,summary,[tabindex]):focus-visible{outline:2px solid var(--color-focus);outline-offset:2px}
.skip-link{position:absolute;left:-9999px} .skip-link:focus{left:16px;top:16px;z-index:100}
```

Also:
- Remove `opacity: 0` from `.animate-fade-in-up` (`globals.css:395`). Fill-mode `both` already holds the start state during the delay.
- Delete the `.focus-ring` class, which uses `outline: none`.
- Fix the `html.focus-mode` selector (finding 2 above).
- Keep the reduced-motion block as the last rule in the file.

### 1.4 Charts

`lightweight-charts` does not reliably parse `oklch()`, and `getComputedStyle` returns a custom property exactly as it was written. In `src/lib/chart-theme.ts`:
- Add `resolveColor(v)`. It paints the value into a 1x1 canvas and reads `getImageData` back as `rgba(r,g,b,a)`.
- Pass every token through it.
- Extend `ChartThemeTokens` with `bullish`, `bearish`, `bullishMuted`, `bearishMuted` and `markerEarnings`.

In `src/components/dashboard/price-chart.tsx`, replace the literals at :130-135, :152 and :171 with those tokens. Key the chart's container on `${theme}-${colorBlindMode}`. Then grep every `addSeries` / `createChart` caller in `src/components/dashboard/*chart*.tsx` for hex literals.

### 1.5 Codemod and ratchet

**`scripts/codemods/tokenize-classes.mjs`:** a regex rewrite over `src/**/*.tsx`, touching only string and template literals, with `--dry` (per-file counts) and `--write`. Commit one family at a time, so each diff is reviewable and can be reverted on its own.

| Pattern | Replacement |
|---|---|
| `text-[8px]`, `[9px]`, `[10px]`, `[11px]`, `[12px]`, `[0.7rem]`, `[0.72rem]`, `[0.78rem]`, `[0.8rem]` | `text-xs` |
| `text-[13px]`, `[0.82-0.88rem]` | `text-sm` |
| `text-[15px]`, `[0.9-0.98rem]`, `[1.05rem]` | `text-base` |
| `text-[1.25rem]` | `text-lg` |
| `text-[2rem]`, `[2.5rem]`, `text-3xl`, `text-4xl` | `text-2xl` |
| `text-5xl` and `text-[clamp(…)]` on `page.tsx` h1 | `text-display` |
| other `text-[clamp(…)]` | `text-2xl lg:text-[var(--text-display)]`, by hand (15 sites) |
| `rounded-[10px]`, `[8px]` | `rounded-lg` |
| `rounded-[12px]`, `[14px]`, `[16px]`, `[18px]`, `rounded-2xl`, `rounded-3xl` | `rounded-xl` |
| `rounded-[2px]`, `[3px]` | by hand: `rounded-full` if the element is 8px tall or less, else `rounded-md` (4 sites) |
| `transition-all` | `transition-colors`, or `transition-[background-color,border-color,color,transform]` where a transform is present |
| `shadow-sm`, `shadow-md` | `shadow-card` |
| `shadow-lg`, `shadow-xl` | `shadow-pop` |
| `shadow-[…]` | by hand (15 sites) |
| inline `style={{fontSize: 8-11}}` | by hand (6 sites) |

**Two cases get a manual review list, not a blind rewrite:**
- Sub-12px text that was only decorative (SVG axis ticks at `page.tsx:465-558`, calendar counts at `calendar/page.tsx:228,233`). Where 12px does not fit at phone width, hide it below `sm` (`hidden sm:inline`) rather than shrinking it.
- `text-white` next to an accent fill. Change it to `text-on-accent`. Leave `text-white` on photos and on brand art.

**`scripts/style-ratchet.mjs`:** counts each pattern in finding 8, plus `-\[#`, `rgba?\(` inside `.tsx`, `bg-white/`, `bg-black/`, `backdrop-blur`, `border-l-(2|4)`, `outline-none` without a sibling `focus-visible:outline`, and any `text-(3xl|4xl|5xl)` or `rounded-(sm|2xl|3xl)`. It fails if any count exceeds `scripts/style-ratchet.baseline.json`, and prints the lower count so a shrinking baseline can be committed. Wire it in as `npm run lint:style`, as a CI step after `docs:check` in `deploy.yml`, and in lint-staged.

### 1.6 Stage 1 verification

- **`tests/unit/theme-contrast.test.ts`** (node environment). Parse each theme block out of `globals.css`, convert OKLCH to sRGB (lift the maths from `ok.mjs` into `src/lib/color-contrast.ts` and unit-test it), then assert, in all 5 themes and in colour-blind mode:

  | Pair | Minimum |
  |---|---|
  | on-accent on accent and on accent-hover | 4.5 |
  | text-primary, secondary, muted on bg-secondary, surface, elevated, hover | 4.5 |
  | border-control on bg-secondary and on bg-elevated | 3.0 |
  | bullish and bearish on bg-secondary | 4.5 |
  | each `-fg` on its `-fill` | 4.5 |

- Run `npx tsc --noEmit`, `npm run lint`, `npm run lint:style`, `npm test`, and `npm run build`. The build proves the namespace resets left no missing utility.
- Take screenshots at 390 and 1440 in every theme. Expect larger headings and heavier control borders; look for regressions in layout, not in colour.
- Switch the theme on each Stage 3 route. Any surface that does not change has a missed literal.
- **Risk: medium.** The change is global but changes values only. The only behavioural edge is chart colour parsing, and `resolveColor` covers it.

---

## Stage 2: Primitives

**Files:** everything in `src/components/ui/`: `button.tsx`, `input.tsx`, `select.tsx`, `textarea.tsx`, `search-input.tsx`, `card.tsx`, `badge.tsx`, `signal-badge.tsx`, `stat-card.tsx`, `empty-state.tsx`, `skeleton.tsx`, `toast.tsx`, `toggle.tsx`, `tabs.tsx`, `confirm-action-modal.tsx`. Also `src/components/layout/top-nav-shell.tsx` and `page-intro.tsx`.

New files:
- `src/components/ui/signed-value.tsx`
- `src/components/ui/status-chip.tsx`
- `src/components/ui/button-link.tsx`
- `src/components/ui/segmented.tsx`
- `src/components/ui/error-state.tsx`
- `src/components/ui/live-region.tsx`
- `src/lib/order-status.ts`

### Button (`button.tsx`)

```ts
const base = "inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap cursor-pointer " +
  "transition-[background-color,border-color,color,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] " +
  "disabled:cursor-not-allowed disabled:opacity-55 aria-busy:cursor-progress";
const sizeStyles = {
  md: "min-h-11 px-4 text-sm",                                               // 44px, the default
  sm: "relative min-h-9 px-3 text-sm before:absolute before:-inset-1 before:content-['']", // 36 visual, 44 hit; dense tables only
};
const variantStyles = {
  primary:     "bg-accent text-on-accent enabled:hover:bg-accent-hover enabled:hover:-translate-y-px enabled:active:translate-y-0",
  secondary:   "border border-border-control bg-bg-surface text-text-primary enabled:hover:bg-bg-hover",
  ghost:       "text-text-secondary enabled:hover:bg-bg-hover enabled:hover:text-text-primary",
  destructive: "border border-bearish-line bg-bearish-fill text-bearish-fg enabled:hover:bg-[color-mix(in_oklch,var(--color-bearish)_18%,var(--color-bg-surface))]",
  danger:      "bg-bearish-solid text-on-bearish enabled:hover:brightness-110", // irreversible confirm only
};
```

- Keep `outline` as an alias of `secondary`, and `lg` as an alias of `md`, so no caller breaks. Mark both `@deprecated`.
- Drop `active:scale`, `shadow-sm` and the `focus-visible:outline-none ring` classes; the global ring covers focus.
- While `loading`, set `aria-busy` and keep the label so the width does not jump.
- Add `ButtonLink` in `button-link.tsx`: the same classes on `next/link`. It replaces `<Link><Button/></Link>` at `dashboard/page.tsx:59` (a button inside an anchor is invalid) and the landing CTAs at `page.tsx:282-286`.

### Input, Select, Textarea, SearchInput

```ts
"w-full min-h-11 rounded-lg border border-border-control bg-bg-secondary px-3 text-base sm:text-sm text-text-primary " +
"placeholder:text-text-muted transition-[border-color] duration-150 " +
"outline-2 outline-offset-2 outline-transparent focus-visible:outline-[var(--color-focus)] " +
"aria-[invalid=true]:border-bearish-line disabled:opacity-55"
```

- Remove `focus:outline-none focus:ring-1 focus:ring-accent/30` at `input.tsx:49`, `select.tsx:64`, `textarea.tsx:31` and `search-input.tsx:59`.
- `text-base` below `sm` stops iOS zooming on focus.
- The Select trigger moves from `bg-bg-elevated` to `bg-bg-secondary`, so every control sits on one fill.
- Error handling: `aria-invalid={!!error}`, `aria-describedby={errorId}`, and `<p id={errorId} className="text-xs text-bearish-fg">`.
- Pass numeric fields through with `inputMode="decimal"` and `enterKeyHint`.
- `SearchInput`: the wrapper paints `focus-within:outline-2 focus-within:outline-[var(--color-focus)]`, per the search-field recipe.

### Card and Surface (`card.tsx`)

- `Card`: `rounded-xl border border-border bg-bg-secondary p-4 lg:p-5 shadow-card`.
- Remove the `hover` prop's `transition-all`. A clickable card becomes a stretched `<Link>` with `after:absolute after:inset-0`.
- Add `<Inset>`: `rounded-lg bg-bg-surface p-3`, no border. Use it wherever a card currently nests inside a card, such as stat tiles inside panels and `page.tsx:323`.
- Dividers inside a container use `divide-[var(--color-hairline-inner)]`.
- `CardTitle` takes an `as` prop so heading levels stay correct.

### Nav item (`top-nav-shell.tsx`)

- Desktop link: `flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary aria-[current=page]:bg-bg-hover aria-[current=page]:text-text-primary aria-[current=page]:font-medium`. It sets `aria-current={active ? "page" : undefined}` and no parallel ternary class.
- The dropdown trigger gets `aria-expanded` and `aria-haspopup="menu"`.
- Mobile drawer items become `min-h-11 text-sm` (currently :406 and :424).
- The hamburger becomes `h-11 w-11` with `top-[calc(env(safe-area-inset-top)+12px)]`.
- The logo tile uses `text-on-accent` (currently :164 and :385).
- Add `<a href="#main" className="skip-link">Skip to content</a>` as the first child, and `id="main"` plus `tabIndex={-1}` on `<main>` (:344). Remove the inline `style` background.

### StatusChip, SignedValue and SignalBadge (money states never rely on colour alone)

**`StatusChip({tone, icon, children})`:**
```ts
"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium " + tones[tone]
```
The tone classes are `bullish: "border-bullish-line bg-bullish-fill text-bullish-fg"`, and the same shape for bearish, warning, neutral and accent. The `icon` prop is required for the bullish and bearish tones, which the TypeScript union enforces. `Badge` becomes a thin wrapper, with its `/10` and `/20` alpha variants replaced by the triplet.

**`SignedValue({value, basis?, format?})`:**
- Uses `formatPnl` from `display-prefs-provider.tsx`, which becomes the only formatter. Switch it to U+2212 for negatives, and render zero as "$0.00" with no sign.
- Renders an `aria-hidden` glyph (▲, ▼ or –), then the signed string, then `<span className="sr-only">gain</span>` or "loss".
- Classes: `font-mono tabular-nums`, coloured `text-bullish` or `text-bearish`.
- It replaces the hand-built strings at `trader/page.tsx:500` and in the `PageIntro` stats.

**`src/lib/order-status.ts` `orderStatusMeta(status)`:** one mapping from broker statuses (new, accepted, pending_new, partially_filled, filled, canceled, expired, rejected, replaced) to `{label, tone, icon}`. Unknown statuses fall through to `{label: raw, tone: "neutral"}`. Add a unit test in `tests/unit/order-status.test.ts`.

**`SignalBadge`:** drop `text-[10px]` and `text-[11px]`. Keep one size, `text-xs`, and add ▲ or ▼ glyphs to the Buy and Sell variants.

### StatCard and PageIntro

- Labels use the `eyebrow` utility. Values are `text-xl font-semibold font-mono tabular-nums`.
- Tone is rendered through `SignedValue` or `StatusChip`, never through `toneClasses` colour alone.
- `PageIntro`: drop the `eyebrow` prop from call sites where it fails the delete test ("Execution Desk" on the trader page repeats the title). Its stat tiles become `Inset`s inside one bordered strip, `grid-cols-2 sm:grid-cols-4`, so they read as a readout rather than four floating cards. PageIntro has 56 users, so the prop stays optional.

### EmptyState and ErrorState

- `EmptyState({kind: "not-connected" | "filtered" | "empty", title, description, action?: {label, href} | {label, onClick}, headingLevel?})`.
  - Only `empty` may carry a create CTA.
  - `filtered` shows "Clear filters".
  - `not-connected` names what to connect and links to `/dashboard/settings#broker`.
- `ErrorState({title, onRetry, traceId?})`, with `role="alert"`. It shows "Could not load … Try again" and "Reference: {traceId}" in `text-xs font-mono`.
- **Loading and error must never reach `EmptyState`.** That rule is what Stage 4b enforces on the trader and tax pages.

### Skeleton and LoadingRegion

- `Skeleton`: `aria-hidden`, and `bg-bg-elevated` with a `var(--color-skeleton-sheen)` gradient instead of the literal `rgba`.
- Add `<LoadingRegion label busy>`: wraps content with `aria-busy={busy}` and renders an always-mounted `<p className="sr-only" role="status">{busy ? `Loading ${label}` : ""}</p>`.
- Skeletons must match the final layout: table rows at the real row height, and stat tiles at the real tile size.

### Toast (`toast.tsx`)

- Two always-mounted, visually hidden regions outside the stack: `role="status"` (polite) and `role="alert"` (assertive). New toast text is written into them. The visual stack items drop their `role`.
- An icon per kind (CheckCircle, AlertTriangle, XCircle, Info) plus the state triplet, so a failure never shows a success tick.
- The dismiss button becomes `h-11 w-11 -m-2` with `aria-label="Dismiss notification"`, replacing the roughly 22px button at :68-70.
- The error kind accepts `traceId`.
- Cap the stack at 3. Keep the timers, but store the handles and clear them on dismiss.

### Segmented control (`segmented.tsx`)

- Used for Buy/Sell, order type and engine mode.
- Track: `inline-flex rounded-lg bg-bg-primary p-1`.
- Buttons: `min-h-10 rounded-md px-3 text-sm aria-pressed:bg-bg-elevated aria-pressed:text-text-primary aria-pressed:shadow-card`.
- Buy and Sell also print their word and carry a glyph.

### Tabs and Toggle

- `Tabs`: remove `outline-none` on the trigger. `TabPanel` hides inactive panels with `hidden` rather than unmounting them.
- `Toggle`: the track border becomes `border-border-control`, the checked fill is `bg-accent`, the thumb is `bg-on-accent` when checked, and the label grows to `min-h-11`.

### Migration of raw buttons

There are 149 raw `<button>` elements. Do not codemod them. Migrate each file when Stage 3 touches it, and let the ratchet hold the count from rising.

### Stage 2 verification

- Build a dev-only gallery page at `src/app/dashboard/admin/ui-kit/page.tsx`, admin-gated, rendering every primitive in every state (rest, hover, focus-visible, active, disabled, loading, error).
- Screenshot it at 390 and 1440 in all themes.
- Tab through it with the keyboard: every stop must show a 2px ring.
- In devtools, check computed box heights are at least 44px, and check the primary hover background is not struck through.
- Tests: `order-status.test.ts` and `format-pnl.test.ts` (sign, zero, missing basis, and the U+2212 minus).
- Run tsc, lint, `lint:style`, test and build.
- **Risk: low to medium.** The prop APIs keep aliases, and the visible changes are heights (Button md goes from 40 to 44) and control borders.

**Recorded 2026-09-24.** The first Stage 2 pass shipped without these checks, and a review then found four defects that the gallery screenshots would have shown: a positioned sm Button pulled back into flow, a direction glyph read off colour tone, a neutral Segmented choice under 3:1, and a confirm summary on its own dialog fill. The checks now run as `npm run capture:kit` (`scripts/capture-redesign.mjs --kit`):

- The gallery lives in `src/components/ui-kit/ui-kit-gallery.tsx`. The admin page gates it, and the script renders it to static HTML with no app, database or session, styled by `globals.css` compiled through Tailwind.
- 14 captures: 390x844 and 1440x900, full page, in light, dark, coral, light-blue, gray, and colour-blind on light and on dark. No capture scrolls sideways.
- Keyboard pass: 35 stops per capture, each with a 2px ring (an outline, or the ring-2 box-shadow the field primitives draw).
- Hit areas: every control reaches 44px, counting a hit-area pseudo-element. This found the sm Button at 42px on bordered variants, fixed in the same series.
- The primary hover paints `accent-hover`. The tile Remove button computes `position: absolute`. The confirm summary fill differs from its dialog.
- The screenshots also showed the SearchInput icon floating below its field in a grid row, fixed in the same series.

What the static render cannot cover: open popovers (Select, dropdowns), toasts, and hover or pressed states other than the primary hover. Those need the app, which this worktree cannot run without a database. The app-route mode of the same script covers them against a local instance with a session cookie.

---

## Stage 3: Page-level changes

These are the screens used most, judging by the nav and the README capture list. Each page's split follows the 400-LOC rule.

### 3a. Trader (`src/app/dashboard/trader/page.tsx`, 1,642 LOC)

**Split into `src/components/trader/`:**
- `engine-controls.tsx` (mode picker, start/stop/halt, banner)
- `risk-override-form.tsx` (:248-260, :334-371, :1530-1575)
- `tax-status-toggle.tsx` (:272-304, :1060-1066)
- `positions-table.tsx`
- `trader-freshness.tsx`

The page keeps data orchestration only.

**Environment strip:** a persistent strip above everything that reads "PAPER" or "LIVE, real money". It carries a text label, an icon, and `StatusChip` tone warning for LIVE. It is bound to shared broker context (Stage 4a), never to a snapshot.

**Freshness line:** `role="status"`, for example "Updated 12s ago" or "Last updated 2m ago, refresh failing". The Connection stat reads "Unknown" once the data is older than two poll intervals.

**Positions and orders:**
- `<table>` from `md` up, with sticky `thead`, right-aligned `font-mono tabular-nums` numeric columns, and rows at `min-h-10`. Status goes through `orderStatusMeta`, P/L through `SignedValue`.
- Below `md`, a card list: symbol as the title, P/L plus qty and avg as metadata, and actions trailing.

**Engine controls:** a `Segmented` mode picker seeded from `engine.mode`. Stop stays a separate action from Switch.

**Replace the "No trader data yet" branch** at :441-466 with three branches: ErrorState (fetch failed), EmptyState `not-connected`, and LoadingRegion.

### 3b. Order ticket (`src/app/dashboard/trade/[symbol]/page.tsx`)

- The header row shows the symbol, the price from `/api/quotes` (or "Price unavailable"), a `SignedValue` change, and the environment chip. The chip text is "Paper account" or "LIVE, real money".
- Side (Buy/Sell) and order type use `Segmented`.
- Qty, notional and prices use `Input` with `inputMode="decimal"`.
- The summary panel is an `Inset`: estimated cost, buying power, and the resulting position.
- The submit label names the environment and the side, for example "Place paper buy" or "Place LIVE sell". Disabled reasons are printed under the button, such as "Engine is running, stop it first" or "Engine status unknown. Retry".
- The confirm modal's confirm button uses the `danger` variant only for LIVE.
- The form is one column below `lg`. From `lg` up it is `grid-cols-[minmax(0,1fr)_20rem]`, with the summary sticky.

### 3c. Dashboard home and watchlists

**Files:** `src/app/dashboard/page.tsx`, `src/components/dashboard/widget-grid.tsx` (583 LOC; split its tile chrome out), `cockpit-watchlist.tsx` (`rounded-[18px]` at :119), `src/app/dashboard/watchlists/page.tsx`.

- Every widget header uses one anatomy: title plus one line of description on the left, controls on the right, `min-w-0` on the text, `shrink-0` on the controls.
- Replace `<Link><Button>` with `ButtonLink`.
- Each widget gets its own LoadingRegion and ErrorState, so one failed widget does not blank the grid.
- Watchlists: batch quotes through `/api/quotes?symbols=`. A failed quote renders "Unavailable" rather than a permanent skeleton (:527-538). The table-to-cards pattern applies below `md`.

### 3d. Tax Center and Tax Report

**Files:** `src/app/dashboard/tax-center/page.tsx`, `src/app/dashboard/tax/page.tsx`.

- Tabs and year come from `useUrlParam`.
- Summary tiles use `SignedValue`.
- Exports use `Button` with loading state and an error toast.
- Three separate states: ErrorState for failure; "No matched lots for {year}" for a genuine empty, with a year switcher; and "Connect a broker or import trades" only for the not-connected case.

### 3e. Public marketing site and login (separate track, separate PR)

**Files:** `src/app/page.tsx` (912 LOC; split the sections into `src/components/marketing/`), `src/components/layout/public-shell.tsx`, `src/app/login/page.tsx`, `src/app/register/…`.

**Landing:**
- Fix the phone overflow: `grid-cols-[minmax(0,1fr)]` on :273, and let the eyebrow chip wrap.
- Delete the `blur-[200px]` glow orb at :272. It is the neon-on-dark tell.
- Keep at most one promo gradient on the page, following the one-exception rule.
- Drop the li borders at :323, and the hover translate on non-links.
- Remove the fake macOS window chrome at :415-421.
- Move the mockup's `bg-[#0c0c14]` and the oklch literals (:450-560) to tokens.
- Make the mockup's "demo" label visible at `text-xs` on every breakpoint (it is 10px and hidden below `sm` at :425), because sample data must be labelled.
- `text-[0.92-0.98rem]` goes to `text-base`. The h1 uses `text-display` with `tracking-[-0.04em]` and `text-wrap:balance`.
- CTAs become `ButtonLink` primary and secondary.
- A contained layout uses one `--gutter` token (`clamp(16px,4vw,56px)`) across the nav, hero and bands.

**Login:**
- Always-mounted `<p role="alert" className="text-sm text-bearish-fg">{error ?? ""}</p>` at :185 and :248.
- Inputs pick up the new primitive automatically.
- The Sign in button uses `text-on-accent`.

### Stage 3 verification

- For each sub-PR, take screenshots at 390x844 and 1440x900 in dark, light and colour-blind dark, and compare them with the baseline.
- At 360px, check with a 60-character unbroken symbol or note that there is no horizontal scroll: `document.documentElement.scrollWidth <= innerWidth`, asserted in the capture script.
- Tab through each page with the keyboard.
- With a screen reader, confirm the toast and freshness line announce.
- Run tsc, lint, `lint:style` (the baseline must drop), test and build.
- **Risk:**
  - 3a and 3b are medium, because they are money-adjacent. Always pair them with a paper-account smoke test: place, confirm, cancel, and engine start/stop.
  - 3c and 3d are low to medium.
  - 3e is low, because it is public and static.

---

## Stage 4: Behaviour fixes

### Shared helpers, landed first

**`src/lib/client/resource.ts`:**
- `type Resource<T> = {status:"loading"} | {status:"error", error:string, traceId?:string} | {status:"ready", data:T, fetchedAt:number}`.
- `useKeyedResource(key, fetcher)` stores the response together with its key. A response for a stale key never paints. A retry is a counter folded into the key.
- Unit-test the reducer in `tests/unit/keyed-resource.test.ts`.

**`src/hooks/use-url-param.ts`:** `useUrlParam(name, fallback, allowed[])` uses `router.replace` with `scroll:false`. Any value not in `allowed` becomes `fallback`. Callers are wrapped in `<Suspense>`.

**`src/lib/client/engine-response.ts`:** `applyEngineResponse(json)` unwraps `{data}` and is the only parse path. Unit-test it in `tests/unit/engine-response.test.ts`.

**`src/lib/client/broker-events.ts`:** `BROKER_CHANGED_EVENT`, with `emitBrokerChanged(connId)` and `onBrokerChanged(cb)`.

### 4a. Money safety (its own PR, first)

1. **Order ticket environment.**
   - Add optional `expectedConnectionId` to the order Zod schema in `src/lib/validators.ts`.
   - In `src/app/api/broker/orders/route.ts`, after `getActiveConnection` (:144), if it is present and does not match, return 409 `{code:"CONNECTION_CHANGED"}`. Put the comparison in a pure lib function and unit-test it in `tests/unit/order-connection-guard.test.ts`.
   - The ticket sends the ID and, on 409, refetches its context, resets the form, and shows an error toast naming the new environment.
   - `broker-switcher.tsx:117-132` emits the event, and the ticket re-runs its context load and resets on it.
   - Once every client sends the ID, make it required.
2. **Engine envelope.** `trader/page.tsx:400` goes through `applyEngineResponse`.
3. **Engine-mode picker.**
   - Seed from `engine.mode`, and keep the picker disabled with `aria-busy` until the status is loaded.
   - A running engine shows Stop. Switch is a separate action and sends the current running mode explicitly.
   - The banner Start (:528-534) uses the last-run mode and toasts on `!r.ok`.
4. **Risk-override form.**
   - A `Resource` state. Save stays disabled until `ready`; an error gets a retry and no Save.
   - Dirty is derived by comparing against the snapshot, and only changed fields are sent.
   - Check `res.ok` and the command result. Show "Unsaved changes" or "All changes saved" in a `role="status"` line, never an unconditional "Saved".
5. **Order ticket with unknown engine status.** A null status is treated as unknown: the pill reads "Engine status unknown", Submit is disabled with that reason, and a retry is offered.

### 4b. Honest states

6. **Trader load and poll.** Track status, `fetchedAt` and error per source (:306-322). Render ErrorState with the trace ID on first failure. On poll failure, keep the data and show the freshness line.
7. **Broken quote fetches.** Point `/api/analyze?symbol=` in the ticket (:101) and watchlists (:143) at `/api/quotes`. For replay (:94), use a new read-only bars route `src/app/api/market/bars/[symbol]/route.ts` with auth, a rate limit, and no side effects. Add `tests/unit/client-fetch-routes.test.ts`: scan `src/**/*.tsx` for literal `fetch("/api/...")` paths and assert that a matching `src/app/api/**/route.ts` exists.
8. **Tax Report and Tax Center.** Keyed responses on `(year, filingStatus, income)`, with income committed on blur. Failure renders ErrorState, separate from a genuine empty. Export failures raise an error toast.
9. **Section 475(f) toggle.** `Resource`-gated, disabled with `aria-busy` until ready. The save sends `notes` only once loaded, or the route switches to a PATCH that ignores omitted fields (`src/app/api/tax-status/route.ts:105-108`). On success the message reads "Applies on next engine start".
10. **Optimizer.** `selectedId` becomes its own state. Only apply a detail response whose ID matches, and have the poll fetch `selectedId` (`optimizer/page.tsx:118-196`).
11. **Leaderboard preferences** (`settings/page.tsx:1023-1046`). An error state renders a retry, and Save is only enabled after a successful load.
12. **URL tabs.** Tax Report, Reports and Earnings use `useUrlParam` (`tax/page.tsx:78-81`, `reports/page.tsx:35`, `earnings/page.tsx:38`).

### Stage 4 verification

- **Unit tests:** keyed-resource, engine-response, order-connection-guard, client-fetch-routes, order-status, format-pnl.
- **Manual on a paper account:**
  - Open the ticket, switch environment in the sidebar, and submit. Expect the ticket to reset, or a 409 `CONNECTION_CHANGED` if the request was already in flight.
  - Start the engine and confirm the LIVE strip and the Stop button appear without a 10s gap.
  - Block `/api/risk-profile` in devtools and confirm Save stays disabled and no limits are wiped.
  - Block `/api/trader/dashboard` and confirm ErrorState appears, not the connect-broker copy.
- **Risk:** 4a is high value and touches the order path, so it lands behind the optional-then-required rollout above. 4b is low.

---

## Verification tooling (all stages)

- **`scripts/capture-redesign.mjs`:** a Playwright script. Add `@playwright/test` as a devDependency. It:
  - uses the `BEACONTRY_SESSION` cookie flow already in `capture-readme-assets.mjs`;
  - sets the theme with `addInitScript(() => localStorage.setItem("sentinel-theme", T))` and colour-blind mode through the display-prefs storage key;
  - captures viewports of 390x844 and 1440x900 at `fullPage: true`, never a 3000px-tall viewport;
  - covers these routes: `/`, `/login`, `/dashboard`, `/dashboard/trader`, `/dashboard/trade/AAPL`, `/dashboard/watchlists`, `/dashboard/tax-center`, `/dashboard/tax`, and `/dashboard/admin/ui-kit`;
  - asserts `scrollWidth <= innerWidth` on every capture and writes `shots/<stage>/<route>-<theme>-<w>.png`.
  - **Built 2026-09-24** as `npm run capture:redesign` (the routes; needs `BEACONTRY_SESSION` and a local instance) and `npm run capture:kit` (the UI kit with no app; see Stage 2 verification). `shots/` is gitignored.
- **Every PR's gate:** `npx tsc --noEmit`, `npm run lint`, `npm run lint:style`, `npm test` and `npm run build`. A money-path PR also needs the paper-account smoke test.