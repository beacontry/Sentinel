---
name: sentinel-redesign
description: Redesign and build UI pages, components, and features for the Sentinel trading intelligence platform. Use when user asks to "redesign", "rebuild", "restyle", "improve the UI", "create a new page", "update a component", "fix the layout", "make it responsive", "add a feature", or any task involving Sentinel's frontend. Covers dashboard pages, trading widgets, data tables, forms, charts, and all visual/interactive elements. Tech stack is Next.js 15 + React 19 + Tailwind CSS 4 + TypeScript.
---

# Sentinel Redesign Skill

You are redesigning the Sentinel trading intelligence platform — a dark-themed, data-dense web application for traders. Every change must feel native to the existing design system while pushing visual quality forward.

## Critical Rules

### Before Any Change
1. **Read the file first.** Never propose changes to code you haven't read.
2. **Read `.claude/skills/sentinel-redesign/references/design-tokens.md`** for the exact color, typography, and spacing system.
3. **Read `.claude/skills/sentinel-redesign/references/component-patterns.md`** for the component library and trading-specific patterns.
4. **Read `.claude/skills/sentinel-redesign/references/page-templates.md`** for standard page layouts, responsive rules, and checklist.
5. **Use existing components.** Check `src/components/ui/` before creating anything new. Sentinel has: Button, Card, Badge, Input, Select, Textarea, Checkbox, Toggle, Modal, Dropdown, Tooltip, Tabs, Pagination, Skeleton, EmptyState, Toast, Avatar, StatCard, SignalBadge, SearchInput.

### Design Philosophy
- **Dark-first.** Pure black backgrounds (`#000000`), zinc surface hierarchy, emerald accent.
- **Data density over whitespace.** Traders need information visible, not hidden behind clicks.
- **Semantic color for trading.** Green = bullish/positive. Red = bearish/negative. Yellow = warning. Never use these colors for non-trading semantics.
- **Monospace for numbers.** All prices, percentages, quantities, and financial data use `font-mono`.
- **Motion is communication.** Every animation serves a purpose — entrance (`fade-in`, `slide-up`), feedback (`scale-in`), loading (`shimmer`). No decorative animation.

### Mobile-First Responsive (Mandatory)
Every page and component must work at 360px. Follow these rules without exception:
- Page padding: `p-4 lg:p-6` — never bare `p-6`
- Header layout: `flex flex-col sm:flex-row sm:items-center justify-between gap-3`
- Button touch targets: `min-h-[44px]`
- Grid columns: always start mobile-first (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`)
- Side-by-side panels: `flex-col lg:flex-row` — never side-by-side below `lg:`
- Tables with 4+ columns: add `overflow-x-auto` wrapper
- Button text on mobile: `<span className="hidden sm:inline">Full Label</span> Short`
- Tabs/horizontal nav: always add `overflow-x-auto`

## Instructions

### Step 1: Understand the Request
Identify what type of work is needed:
- **Page redesign**: Full page rebuild (read `.claude/skills/sentinel-redesign/references/page-templates.md`)
- **Component update**: Modify existing UI component (read `.claude/skills/sentinel-redesign/references/component-patterns.md`)
- **New feature**: New page or widget (read all three reference files)
- **Layout fix**: Responsive or spacing issue (read `.claude/skills/sentinel-redesign/references/page-templates.md`)
- **Style update**: Colors, typography, or theme changes (read `.claude/skills/sentinel-redesign/references/design-tokens.md`)

### Step 2: Audit Current State
1. Read the target file(s) completely
2. Identify what works and what needs improvement
3. Check which existing components from `src/components/ui/` can be reused
4. Note any responsive issues (missing mobile breakpoints, fixed widths, bare grid-cols)

### Step 3: Design the Solution
Apply these patterns based on content type:

**Data-heavy pages** (screener, portfolio, positions, trades):
- Use tables with sticky headers, `font-mono` for numbers, right-aligned numeric columns
- Add `overflow-x-auto` wrapper for mobile
- Color-code P&L values: `text-bullish` for positive, `text-bearish` for negative
- Consider card-based mobile fallback for complex tables

**Dashboard/overview pages** (main dashboard, analysis):
- Grid of StatCard components for key metrics
- Card-based widget layout with `gap-4` or `gap-6`
- Responsive grid: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`

**Form pages** (settings, create strategy, journal entry):
- Constrain width: `max-w-3xl`
- Use Card sections to group related fields
- Grid inputs: `grid grid-cols-1 sm:grid-cols-2 gap-3`
- Icon + title for section headers
- Feedback: success state with `text-bullish` + Check icon, errors with `text-bearish`

**Detail pages** (stock analysis, thread view, article):
- Header with key info + action buttons
- Tabbed content sections using Tabs component
- Sidebar stats on desktop, stacked on mobile: `flex-col lg:flex-row`

### Step 4: Implement
Follow these implementation rules:

**Imports:** Use path aliases (`@/components/ui/...`, `@/lib/...`)

**Color usage:** Always use design token classes, never raw hex:
- `bg-bg-primary`, `bg-bg-secondary`, `bg-bg-surface`, `bg-bg-elevated`, `bg-bg-hover`
- `text-text-primary`, `text-text-secondary`, `text-text-muted`
- `border-border`, `border-border-hover`
- `text-accent`, `bg-accent`, `text-bullish`, `text-bearish`, `text-warning`
- Muted backgrounds: `bg-accent/10`, `bg-bullish/10`, `bg-bearish/10`

**Component patterns:**
- Cards: `<Card>` with optional `hover` prop for clickable cards
- Selected state on cards: `border-accent/50`
- Headers inside cards: `<CardHeader>` + `<CardTitle>` with optional icon
- Forms: `<Input label="..." />` with error prop for validation
- Actions: `<Button variant="primary|secondary|ghost|destructive|outline" size="sm|md|lg">`
- Loading: `<Button loading>` for async actions, `<Skeleton>` for content loading
- Empty states: `<EmptyState icon={...} title="..." description="..." action={{...}} />`
- Badges: `<Badge variant="bullish|bearish|warning|neutral">` for status
- Signals: `<SignalBadge signal="STRONG_BUY|BUY|HOLD|SELL|STRONG_SELL">`

**Interactive patterns:**
- Hover on cards: `transition-colors duration-150 hover:border-border-hover hover:bg-bg-elevated`
- Button press: `active:scale-[0.98]` (built into Button component)
- Focus rings: `focus-visible:ring-2 focus-visible:ring-accent`
- Loading spinner: border spinner `border-2 border-accent/30 border-t-accent rounded-full animate-spin`
- Edit mode banner: `bg-accent/10 border border-accent/20` with accent icon

**Table patterns:**
```
<div className="overflow-x-auto">
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b border-border text-text-muted text-left">
        <th className="pb-2 pr-4 font-medium">Column</th>
        <th className="pb-2 pr-4 font-medium text-right">Number</th>
      </tr>
    </thead>
    <tbody className="font-mono">
      <tr className="border-b border-border/50">
        <td className="py-2 pr-4">Value</td>
        <td className="py-2 text-right">123.45</td>
      </tr>
    </tbody>
  </table>
</div>
```

### Step 5: Verify Quality
Before finishing, check every item:

- [ ] Uses existing UI components from `src/components/ui/` (no reinventing)
- [ ] All colors use design token classes (no raw hex, no `text-gray-400` etc.)
- [ ] Page padding is `p-4 lg:p-6`
- [ ] Header uses `flex flex-col sm:flex-row` stacking pattern
- [ ] All buttons have `min-h-[44px]` touch targets (md/lg sizes do this automatically)
- [ ] All grids start with mobile column count (`grid-cols-1 sm:grid-cols-2`)
- [ ] No side-by-side layouts below `lg:` breakpoint
- [ ] Financial numbers use `font-mono`
- [ ] P&L values are color-coded (bullish/bearish)
- [ ] Tables have `overflow-x-auto` wrapper
- [ ] Empty states are designed (icon + message + optional CTA)
- [ ] Loading states exist (Skeleton or spinner)
- [ ] Animations are functional, not decorative
- [ ] No `console.log` statements left in code

## Examples

### Example 1: Redesign a Dashboard Page
User says: "Redesign the alerts page"

Actions:
1. Read `src/app/dashboard/alerts/page.tsx` fully
2. Read `.claude/skills/sentinel-redesign/references/page-templates.md` for standard layout
3. Read `.claude/skills/sentinel-redesign/references/component-patterns.md` for applicable components
4. Identify issues: missing responsive patterns, inconsistent spacing, no empty state
5. Rebuild with: proper header stacking, StatCard summary row, filterable table with Badge variants, EmptyState for zero alerts, Skeleton loading state
6. Verify against quality checklist

### Example 2: Create a New Component
User says: "Add a price change indicator component"

Actions:
1. Check `src/components/ui/` for existing similar components (Badge, SignalBadge, StatCard)
2. Read `.claude/skills/sentinel-redesign/references/design-tokens.md` for color tokens
3. Build component using trading semantics: `text-bullish` for positive, `text-bearish` for negative, `font-mono` for the number, TrendingUp/TrendingDown icons from lucide-react
4. Export from component file, use in target page

### Example 3: Fix Responsive Layout
User says: "The screener page is broken on mobile"

Actions:
1. Read `src/app/dashboard/screener/page.tsx` fully
2. Check against mobile rules: bare `grid-cols-3`? Missing `overflow-x-auto`? Fixed widths?
3. Fix: add mobile-first grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`), wrap tables in `overflow-x-auto`, stack header with `flex-col sm:flex-row`, ensure 44px touch targets

## Troubleshooting

### Colors look wrong
Cause: Using Tailwind default colors instead of design tokens
Solution: Replace `text-green-500` with `text-bullish`, `bg-gray-800` with `bg-bg-elevated`, etc. All colors must come from the `@theme` block in `globals.css`.

### Component doesn't exist
Cause: Trying to import a component that hasn't been created
Solution: Check `src/components/ui/` first. If truly needed, create it following the patterns in `.claude/skills/sentinel-redesign/references/component-patterns.md`. Keep it under 200 LOC. Export named, not default.

### Layout breaks on mobile
Cause: Missing responsive breakpoints
Solution: Every layout class needs a mobile-first value. `grid-cols-3` alone = 3 cols on phones. Must be `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.

### Tailwind classes not applying
Cause: Sentinel uses Tailwind CSS 4 with `@theme` block, not `tailwind.config.ts`
Solution: Custom colors are used as `bg-bg-surface`, `text-accent`, etc. The `@theme` block defines CSS custom properties that Tailwind 4 auto-registers as utility classes.
