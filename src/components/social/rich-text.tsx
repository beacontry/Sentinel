"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";

/**
 * RichText — parses post/thread/reply content and renders:
 *  - $SYMBOL or @SYMBOL → links to /dashboard/analysis?symbol=SYMBOL
 *  - [[page:slug]] → deep links to app sections (e.g. [[screener]], [[journal]])
 *  - Regular text preserved with whitespace
 */

// Known app sections for [[page]] links
const APP_PAGES: Record<string, { label: string; href: string }> = {
  analysis: { label: "Analysis", href: "/dashboard/analysis" },
  screener: { label: "Screener", href: "/dashboard/screener" },
  heatmap: { label: "Heatmap", href: "/dashboard/heatmap" },
  correlation: { label: "Correlation", href: "/dashboard/correlation" },
  journal: { label: "Journal", href: "/dashboard/journal" },
  performance: { label: "Performance", href: "/dashboard/performance" },
  "pnl-calendar": { label: "P&L Calendar", href: "/dashboard/pnl-calendar" },
  "tax-center": { label: "Tax Center", href: "/dashboard/tax-center" },
  tax: { label: "Tax Report", href: "/dashboard/tax" },
  strategies: { label: "Strategies", href: "/dashboard/strategies" },
  backtest: { label: "Backtest", href: "/dashboard/backtest" },
  calculator: { label: "Calculator", href: "/dashboard/calculator" },
  news: { label: "News", href: "/dashboard/news" },
  filings: { label: "Filings", href: "/dashboard/filings" },
  insights: { label: "Insights", href: "/dashboard/insights" },
  alerts: { label: "Alerts", href: "/dashboard/alerts" },
  "relative-strength": { label: "Relative Strength", href: "/dashboard/relative-strength" },
  calendar: { label: "Economic Calendar", href: "/dashboard/calendar" },
  trader: { label: "Live Trader", href: "/dashboard/trader" },
  portfolio: { label: "Portfolio", href: "/dashboard/portfolio" },
  settings: { label: "Settings", href: "/dashboard/settings" },
};

// Match $SYMBOL, @SYMBOL (1-6 uppercase letters), or [[page]] patterns
// Also match $SYMBOL followed by optional punctuation but not more letters
const TOKEN_REGEX = /(\$[A-Za-z]{1,6}|@[A-Za-z]{1,6}|\[\[[a-z\-]+\]\])/g;

interface RichTextProps {
  content: string;
  className?: string;
}

export function RichText({ content, className = "" }: RichTextProps) {
  const parts = parseContent(content);

  return (
    <span className={className}>
      {parts.map((part, i) => (
        <RichTextPart key={i} part={part} />
      ))}
    </span>
  );
}

// ─── Types ────────────────────────────────────────────────────────

type TextPart =
  | { type: "text"; value: string }
  | { type: "symbol"; symbol: string }
  | { type: "page"; slug: string; label: string; href: string };

// ─── Parser ───────────────────────────────────────────────────────

function parseContent(content: string): TextPart[] {
  const parts: TextPart[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(TOKEN_REGEX)) {
    const matchIndex = match.index;
    if (matchIndex === undefined) continue;

    // Add preceding text
    if (matchIndex > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, matchIndex) });
    }

    const token = match[1];

    if (token.startsWith("$") || token.startsWith("@")) {
      // Symbol mention: $NVDA or @NVDA
      const symbol = token.slice(1).toUpperCase();
      parts.push({ type: "symbol", symbol });
    } else if (token.startsWith("[[") && token.endsWith("]]")) {
      // App page link: [[screener]]
      const slug = token.slice(2, -2);
      const page = APP_PAGES[slug];
      if (page) {
        parts.push({ type: "page", slug, label: page.label, href: page.href });
      } else {
        // Unknown page, render as plain text
        parts.push({ type: "text", value: token });
      }
    }

    lastIndex = matchIndex + token.length;
  }

  // Remaining text
  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  return parts;
}

// ─── Renderers ────────────────────────────────────────────────────

function RichTextPart({ part }: { part: TextPart }): ReactNode {
  switch (part.type) {
    case "text":
      return <>{part.value}</>;

    case "symbol":
      return (
        <Link
          href={`/dashboard/analysis?symbol=${part.symbol}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded
            bg-accent/10 text-accent font-medium text-[13px] font-mono
            hover:bg-accent/20 transition-colors duration-150 no-underline"
        >
          <TrendingUp className="w-3 h-3" />
          ${part.symbol}
        </Link>
      );

    case "page":
      return (
        <Link
          href={part.href}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded
            bg-bg-hover text-text-primary text-[13px] font-medium
            hover:bg-accent/10 hover:text-accent transition-colors duration-150 no-underline"
        >
          {part.label}
        </Link>
      );

    default:
      return null;
  }
}

// ─── Utility ──────────────────────────────────────────────────────

/** Extract all $SYMBOL / @SYMBOL mentions from content */
export function extractSymbols(content: string): string[] {
  const symbols: Set<string> = new Set();
  for (const match of content.matchAll(TOKEN_REGEX)) {
    const token = match[1];
    if (token.startsWith("$") || token.startsWith("@")) {
      symbols.add(token.slice(1).toUpperCase());
    }
  }
  return Array.from(symbols);
}
