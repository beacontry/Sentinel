"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Search,
  LogOut,
  BarChart3,
  Send,
  Clock,
} from "lucide-react";
import {
  COMMAND_PALETTE_EVENT,
  NAV_ITEMS,
  SUB_NAV,
} from "@/components/layout/nav-config";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";

// Build a flat list of all navigable pages (main items + sub-nav pages)
function getAllPages() {
  const pages = NAV_ITEMS.map((item) => ({
    href: item.href,
    label: item.label,
    description: item.description,
    icon: item.icon,
    keywords: item.keywords ?? [],
  }));

  // Add sub-nav pages that aren't already in main nav
  const mainHrefs = new Set(pages.map((p) => p.href));
  for (const tabs of Object.values(SUB_NAV)) {
    for (const tab of tabs) {
      if (!mainHrefs.has(tab.href)) {
        pages.push({
          href: tab.href,
          label: tab.label,
          description: "",
          icon: Search,
          keywords: [],
        });
      }
    }
  }

  return pages;
}

const ALL_PAGES = getAllPages();

// Heuristic for "this looks like a ticker." 1-5 uppercase letters, optionally
// with a trailing dot+1 char (e.g. BRK.B). Not exhaustive — Sentinel will
// let through anything matching this pattern and the analysis page will
// 404 gracefully if it's not a real symbol.
const TICKER_RE = /^[A-Z][A-Z0-9]{0,4}(\.[A-Z])?$/;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { entries: recentEntries } = useRecentlyViewed();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setOpen((v) => !v);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    function handleOpen() {
      setOpen(true);
    }

    document.addEventListener(COMMAND_PALETTE_EVENT, handleOpen);
    return () => document.removeEventListener(COMMAND_PALETTE_EVENT, handleOpen);
  }, []);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router]
  );

  // Clear query state when palette closes so the next open starts fresh.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // If the user has typed something that looks like a ticker, surface
  // a top-of-list "jump to symbol" option. Doesn't pre-validate against
  // Yahoo/Finnhub — analysis page handles unknown symbols gracefully.
  const upperQuery = query.trim().toUpperCase();
  const looksLikeTicker = upperQuery.length > 0 && TICKER_RE.test(upperQuery);

  const handleLogout = useCallback(async () => {
    setOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-bg-primary/80 animate-fade-in"
        onClick={() => setOpen(false)}
      />

      <div className="absolute left-1/2 top-[12%] w-full max-w-2xl -translate-x-1/2 px-4">
        <Command
          className="overflow-hidden rounded-xl border border-border bg-bg-secondary animate-scale-in"
          loop
        >
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="h-4 w-4 text-text-muted shrink-0" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search pages, jump to a symbol (AAPL, NVDA), run an action..."
              className="h-12 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
              autoFocus
            />
            <kbd className="hidden rounded-md border border-border bg-bg-elevated px-2 py-1 font-mono text-[11px] text-text-muted sm:inline-flex">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[28rem] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-text-muted">
              No results found.
            </Command.Empty>

            {/* Ticker quick-actions — render only when query matches the
                ticker shape so we don't clutter the list otherwise. */}
            {looksLikeTicker && (
              <Command.Group
                heading={`Symbol: ${upperQuery}`}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2
                  [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase
                  [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-accent
                  [&_[cmdk-group-heading]]:font-medium"
              >
                <Command.Item
                  value={`__sym_chart_${upperQuery}`}
                  keywords={[upperQuery, "chart", "analysis", "view"]}
                  onSelect={() =>
                    navigate(`/dashboard/analysis?symbol=${encodeURIComponent(upperQuery)}`)
                  }
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm
                    text-text-secondary outline-none
                    data-[selected=true]:bg-accent/10 data-[selected=true]:text-text-primary
                    transition-colors"
                >
                  <BarChart3 className="h-4 w-4 shrink-0 text-accent" />
                  <div className="min-w-0">
                    <div className="font-medium text-text-primary">Open chart</div>
                    <div className="truncate text-xs text-text-muted">
                      Analyze {upperQuery} with signal + indicators
                    </div>
                  </div>
                </Command.Item>
                <Command.Item
                  value={`__sym_trade_${upperQuery}`}
                  keywords={[upperQuery, "trade", "order", "buy", "sell"]}
                  onSelect={() =>
                    navigate(`/dashboard/trade/${encodeURIComponent(upperQuery)}`)
                  }
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm
                    text-text-secondary outline-none
                    data-[selected=true]:bg-accent/10 data-[selected=true]:text-text-primary
                    transition-colors"
                >
                  <Send className="h-4 w-4 shrink-0 text-accent" />
                  <div className="min-w-0">
                    <div className="font-medium text-text-primary">Trade {upperQuery}</div>
                    <div className="truncate text-xs text-text-muted">
                      Open the manual order ticket
                    </div>
                  </div>
                </Command.Item>
              </Command.Group>
            )}

            {/* Recently viewed symbols — only render when the user has any */}
            {recentEntries.length > 0 && !looksLikeTicker && (
              <Command.Group
                heading="Recently viewed"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2
                  [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase
                  [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-text-muted
                  [&_[cmdk-group-heading]]:font-medium"
              >
                {recentEntries.slice(0, 5).map((entry) => (
                  <Command.Item
                    key={entry.symbol}
                    value={`__recent_${entry.symbol}`}
                    keywords={[entry.symbol, "recent", "history"]}
                    onSelect={() =>
                      navigate(`/dashboard/analysis?symbol=${encodeURIComponent(entry.symbol)}`)
                    }
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm
                      text-text-secondary outline-none
                      data-[selected=true]:bg-accent/10 data-[selected=true]:text-text-primary
                      transition-colors"
                  >
                    <Clock className="h-4 w-4 shrink-0 text-text-muted" />
                    <div className="min-w-0">
                      <div className="font-mono font-medium text-text-primary">
                        {entry.symbol}
                      </div>
                      <div className="text-xs text-text-muted">Open chart</div>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group
              heading="Pages"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2
                [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase
                [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-text-muted
                [&_[cmdk-group-heading]]:font-medium"
            >
              {ALL_PAGES.map((page) => (
                <Command.Item
                  key={page.href}
                  value={`${page.label} ${page.description} ${page.keywords.join(" ")}`}
                  onSelect={() => navigate(page.href)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm
                    text-text-secondary outline-none
                    data-[selected=true]:bg-accent/10 data-[selected=true]:text-text-primary
                    transition-colors"
                >
                  <page.icon className="h-4 w-4 shrink-0 text-text-muted" />
                  <div className="min-w-0">
                    <div className="font-medium text-text-primary">{page.label}</div>
                    {page.description && (
                      <div className="truncate text-xs text-text-muted">
                        {page.description}
                      </div>
                    )}
                  </div>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Separator className="my-2 h-px bg-border" />
            <Command.Group
              heading="Actions"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2
                [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase
                [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-text-muted
                [&_[cmdk-group-heading]]:font-medium"
            >
              <Command.Item
                value="log out sign out"
                onSelect={handleLogout}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm
                  text-text-secondary outline-none
                  data-[selected=true]:bg-bearish/10 data-[selected=true]:text-bearish
                  transition-colors"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <div>
                  <div className="font-medium">Log Out</div>
                  <div className="text-xs text-text-muted">Leave the workspace</div>
                </div>
              </Command.Item>
            </Command.Group>
          </Command.List>

          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[11px] text-text-muted">
            <span>Navigate with <kbd className="font-mono">↑↓</kbd> and <kbd className="font-mono">Enter</kbd></span>
            <span className="font-mono">{ALL_PAGES.length} routes</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
