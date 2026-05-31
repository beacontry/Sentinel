"use client";

// Phase B.2 — Analysis Cockpit panels now mean three different things:
//
//   Signals    = top-conviction signals from the global market screener
//                (/api/screener). Symbols you might NOT be watching yet.
//                Independent of your watchlist.
//
//   Watchlist  = your personal saved symbols. Multi-list-aware: a switcher
//                in the panel header picks which named list is active, and
//                add/remove acts on that list. Defaults to your "default"
//                list if you have one, otherwise the first list.
//
//   Recent     = symbols you've clicked recently (any source). Stored in
//                localStorage by useRecentlyViewed. Pure nav aid, never
//                writes to a watchlist.
//
// Click flow:
//   - Click a Signal → analyzes the symbol, doesn't add to watchlist.
//   - Click a Watchlist row → analyzes and selects.
//   - Click a Recent row → analyzes and selects (same as watchlist click).
//   - Every click also pushes the symbol onto Recently Viewed.

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AnalysisResult } from "@/types";
import { SignalDetails } from "@/components/dashboard/signal-details";
// react-resizable-panels removed 2026-05-13 — sweep edge cases got too
// tangled with TradingView's widget lifecycle + body scroll-lock +
// nested orientation. Plain CSS Grid covers the use case.
import { PriceChart, type ChartEvent } from "@/components/dashboard/price-chart";
import { TradingViewChart } from "@/components/dashboard/tradingview-chart";
import { IntelligenceTabs } from "@/components/dashboard/intelligence-tabs";
import {
  CockpitWatchlist,
  type WatchlistOption,
} from "@/components/dashboard/cockpit-watchlist";
import { PageIntro } from "@/components/layout/page-intro";
import { Button } from "@/components/ui/button";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import {
  Activity,
  Plus,
  Search,
  X,
  Crosshair,
  RefreshCw,
  Focus,
  Maximize2,
} from "lucide-react";
import { ChartFullscreenOverlay } from "@/components/ui/chart-fullscreen-overlay";
import { PaywallBanner } from "@/components/tiers/paywall-banner";

const FOCUS_STORAGE_KEY = "sentinel-focus-mode";

const POPULAR_SYMBOLS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN"];

// (Screener cache constants + ScreenerCacheItem type removed when the
// Signals panel was deleted on 2026-05-13. Users get signals from
// /dashboard/screener directly now.)

// Wrap the body in Suspense because useSearchParams() is a client-side
// hook that opts the route out of static prerendering. Next.js 15
// requires the Suspense boundary so the SSR shell can render while the
// client hydrates the query-param read. Without this the build fails:
// "useSearchParams() should be wrapped in a suspense boundary".
export default function AnalysisCockpitPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full">
          <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      }
    >
      <AnalysisCockpit />
    </Suspense>
  );
}

function AnalysisCockpit() {
  // Respect ?symbol=XXX query param — links from anywhere else in the
  // app (positions list, recently-viewed dropdown, SymbolLink in widgets,
  // shared watchlist tiles) deep-link to a specific symbol. Without this
  // the page silently opened whatever was first in the watchlist instead.
  const searchParams = useSearchParams();
  const requestedSymbol = searchParams.get("symbol")?.toUpperCase().trim() ?? null;

  const [symbols, setSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, AnalysisResult>>({});
  const [analyzingSymbols, setAnalyzingSymbols] = useState<Set<string>>(new Set());
  const [initialLoad, setInitialLoad] = useState(true);
  const [chartEvents, setChartEvents] = useState<ChartEvent[]>([]);
  const [newSymbol, setNewSymbol] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);

  // Phase A — multi-watchlist state. The dropdown in the Watchlist panel
  // header lets the user switch between their named lists; activeWatchlistId
  // is the one whose contents drive `symbols`.
  const [watchlistOptions, setWatchlistOptions] = useState<WatchlistOption[]>([]);
  const [activeWatchlistId, setActiveWatchlistId] = useState<string | null>(null);

  // Chart engine: "engine" = our lightweight-charts view with signal/earnings
  // markers; "tradingview" = embedded TradingView Advanced Chart with full
  // drawing tools. User toggles per their preference; choice persists in
  // localStorage so power users default to TradingView.
  const [chartMode, setChartMode] = useState<"engine" | "tradingview">("engine");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("sentinel-chart-mode");
    if (saved === "tradingview" || saved === "engine") setChartMode(saved);
  }, []);
  function switchChartMode(next: "engine" | "tradingview") {
    setChartMode(next);
    try {
      window.localStorage.setItem("sentinel-chart-mode", next);
    } catch {
      // Quota / disabled — non-critical
    }
  }

  // Chart fullscreen. Restored after the empty-panel bug turned out to
  // be a PriceChart sizing issue (its container had no height style →
  // clientHeight=0 → fell back to 400px hardcode regardless of panel
  // size). Now that PriceChart fills its parent properly when
  // height="fill", the fullscreen overlay works correctly too. We keep
  // both safeguards from the previous attempt: the in-page chart is
  // suppressed (placeholder rendered) while the overlay is open, and
  // the overlay pads body padding-right to compensate for scrollbar
  // removal so PanelGroup doesn't drift.
  const [chartFullscreen, setChartFullscreen] = useState(false);

  // Focus mode — collapses the left dashboard sidebar to maximize the
  // research workspace. Persists across visits via localStorage. The
  // sidebar listens for an `html.focus-mode` class (see globals.css).
  // The class is also removed on unmount in case the user navigates to
  // a different page and forgets to disable it (sidebar otherwise stays
  // hidden globally, which would be confusing).
  const [focusMode, setFocusModeState] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(FOCUS_STORAGE_KEY);
    if (saved === "1") {
      setFocusModeState(true);
      document.documentElement.classList.add("focus-mode");
    }
    return () => {
      document.documentElement.classList.remove("focus-mode");
    };
  }, []);
  function setFocusMode(next: boolean) {
    setFocusModeState(next);
    document.documentElement.classList.toggle("focus-mode", next);
    try {
      window.localStorage.setItem(FOCUS_STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* quota — non-critical */
    }
  }

  // Phase B.1 — Recently viewed (localStorage-backed)
  const { entries: recentEntries, push: pushRecent } = useRecentlyViewed();

  // ─── Watchlist boot: list all the user's lists, then load the active one ─
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const res = await fetch("/api/watchlists");
        if (!res.ok) {
          if (!cancelled) setInitialLoad(false);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const lists: WatchlistOption[] = data.watchlists ?? [];
        setWatchlistOptions(lists);

        // Pick the default list, or the first one. If the user has no lists
        // yet (brand new account), we leave activeWatchlistId null and the
        // empty-state will guide them to add a symbol — adding will create a
        // "Default" list on the fly via the legacy POST /api/watchlist path.
        const initial = lists.find((l) => l.isDefault)?.id ?? lists[0]?.id ?? null;
        setActiveWatchlistId(initial);

        if (!initial) {
          if (!cancelled) setInitialLoad(false);
          return;
        }

        // Load the active list's symbols
        const detailRes = await fetch(`/api/watchlists/${initial}`);
        if (!detailRes.ok) {
          if (!cancelled) setInitialLoad(false);
          return;
        }
        const detail = await detailRes.json();
        if (cancelled) return;
        setSymbols(detail.symbols ?? []);
      } catch {
        // Non-critical
      } finally {
        if (!cancelled) setInitialLoad(false);
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Switch handler: load a different list's symbols ────────────
  const switchToList = useCallback(async (id: string) => {
    if (id === activeWatchlistId) return;
    setActiveWatchlistId(id);
    setAnalyses({});
    setSelectedSymbol(null);
    try {
      const res = await fetch(`/api/watchlists/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setSymbols(data.symbols ?? []);
    } catch {
      // Ignore
    }
  }, [activeWatchlistId]);

  // Signals panel removed 2026-05-13 — screener cache fetch deleted with
  // it. Users get top-conviction signals on /dashboard/screener.

  // ─── Analyze a single symbol ────────────────────────────────────
  const analyzeSymbol = useCallback(async (symbol: string) => {
    setAnalyzingSymbols((prev) => new Set(prev).add(symbol));
    try {
      const res = await fetch(`/api/analyze/${encodeURIComponent(symbol)}?days=5&resolution=5m`);
      if (res.ok) {
        const data: AnalysisResult = await res.json();
        setAnalyses((prev) => ({ ...prev, [symbol]: data }));
      }
    } catch {
      // Analysis failed -- user can retry
    } finally {
      setAnalyzingSymbols((prev) => {
        const next = new Set(prev);
        next.delete(symbol);
        return next;
      });
    }
  }, []);

  // Analyze all watchlist symbols whenever the active list changes
  useEffect(() => {
    if (!initialLoad && symbols.length > 0) {
      for (const sym of symbols) {
        if (!analyses[sym]) analyzeSymbol(sym);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoad, symbols]);

  // Auto-select first symbol once analyses are available. If the URL
  // carries a ?symbol=XXX param, prefer that — and trigger an analyze()
  // for it even if it's not on the user's watchlist, so deep-links to
  // arbitrary tickers (e.g. clicking a position the user doesn't watch)
  // still work.
  useEffect(() => {
    if (selectedSymbol) return;
    if (requestedSymbol) {
      setSelectedSymbol(requestedSymbol);
      if (!analyses[requestedSymbol]) {
        analyzeSymbol(requestedSymbol);
      }
      pushRecent(requestedSymbol);
      return;
    }
    if (symbols.length > 0) {
      setSelectedSymbol(symbols[0]);
    }
    // selectedSymbol intentionally omitted from deps — we only auto-pick
    // when nothing is selected, and either symbols loads or the URL param
    // resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols, requestedSymbol]);

  // If the URL changes ?symbol= while the user is on the page (e.g. they
  // hit the back button or a Cmd+K jump fires a router.push), respect it.
  useEffect(() => {
    if (!requestedSymbol) return;
    if (selectedSymbol === requestedSymbol) return;
    setSelectedSymbol(requestedSymbol);
    if (!analyses[requestedSymbol]) analyzeSymbol(requestedSymbol);
    pushRecent(requestedSymbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedSymbol]);

  // Fetch earnings for chart markers when selected symbol changes
  useEffect(() => {
    if (!selectedSymbol) {
      setChartEvents([]);
      return;
    }
    async function fetchEarnings() {
      try {
        const res = await fetch(`/api/earnings?symbols=${encodeURIComponent(selectedSymbol!)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.earnings?.length > 0) {
          setChartEvents(
            data.earnings.map((e: { date: string; hour: string }) => ({
              date:
                e.date +
                "T" +
                (e.hour === "bmo" ? "09:30:00" : "16:00:00"),
              type: "earnings" as const,
              label: `Earnings ${e.hour === "bmo" ? "(Pre)" : e.hour === "amc" ? "(Post)" : ""}`,
            }))
          );
        } else {
          setChartEvents([]);
        }
      } catch {
        setChartEvents([]);
      }
    }
    fetchEarnings();
  }, [selectedSymbol]);

  // Watchlist-analysis lookup for the panel's confidence badges
  const watchlistAnalyses: Record<string, { signal: string; confidence: number; timestamp: string }> = {};
  for (const sym of symbols) {
    if (analyses[sym]) {
      watchlistAnalyses[sym] = {
        signal: analyses[sym].signal,
        confidence: analyses[sym].confidence,
        timestamp: analyses[sym].timestamp,
      };
    }
  }

  const selectedAnalysis = selectedSymbol ? analyses[selectedSymbol] ?? null : null;
  const isSelectedLoading = selectedSymbol ? analyzingSymbols.has(selectedSymbol) : false;
  const isAnyLoading = analyzingSymbols.size > 0;

  // ─── Symbol mutations on the ACTIVE list ────────────────────────
  async function handleAddSymbol(symbol: string) {
    const sym = symbol.trim().toUpperCase();
    if (!sym || symbols.includes(sym)) return;

    setSymbols((prev) => [...prev, sym]);
    setSelectedSymbol(sym);
    pushRecent(sym);
    setShowAddInput(false);
    setNewSymbol("");

    try {
      // If we have an active list, use the per-list endpoint. Otherwise the
      // legacy /api/watchlist endpoint creates a "Default" list on the fly.
      const endpoint = activeWatchlistId
        ? `/api/watchlists/${activeWatchlistId}/items`
        : "/api/watchlist";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym }),
      });
      if (!res.ok) throw new Error("Failed to save");

      // If we just created a list via the legacy path, refetch list metadata
      // so the switcher has an option to point at.
      if (!activeWatchlistId) {
        const listsRes = await fetch("/api/watchlists");
        if (listsRes.ok) {
          const data = await listsRes.json();
          const lists: WatchlistOption[] = data.watchlists ?? [];
          setWatchlistOptions(lists);
          setActiveWatchlistId(lists.find((l) => l.isDefault)?.id ?? lists[0]?.id ?? null);
        }
      }
    } catch {
      setSymbols((prev) => prev.filter((s) => s !== sym));
      setSelectedSymbol((prev) => (prev === sym ? symbols[0] ?? null : prev));
      return;
    }

    analyzeSymbol(sym);
  }

  async function handleRemoveSymbol(symbol: string) {
    const prevSymbols = symbols;
    const prevAnalyses = analyses;
    const prevSelected = selectedSymbol;

    setSymbols((prev) => prev.filter((s) => s !== symbol));
    setAnalyses((prev) => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
    if (selectedSymbol === symbol) {
      setSelectedSymbol(symbols.find((s) => s !== symbol) ?? null);
    }

    try {
      const endpoint = activeWatchlistId
        ? `/api/watchlists/${activeWatchlistId}/items`
        : "/api/watchlist";
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (!res.ok) throw new Error("Failed to remove");
    } catch {
      setSymbols(prevSymbols);
      setAnalyses(prevAnalyses);
      setSelectedSymbol(prevSelected);
    }
  }

  // Selecting a symbol from any panel just analyzes + selects it. NEVER
  // mutates the watchlist — that's intentional, so clicking a screener
  // signal is low-friction.
  function handleSelectSignal(symbol: string) {
    setSelectedSymbol(symbol);
    pushRecent(symbol);
    if (!analyses[symbol]) analyzeSymbol(symbol);
  }

  if (initialLoad) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-6 p-4 lg:p-6">
      <PaywallBanner minTier="trader" featureName="Analysis cockpit" description="Charts, hybrid signals, signal history. Free users see public data only; engine + Finnhub layers unlock with Trader." />
      <PageIntro
        eyebrow="Research Desk"
        title="Analysis Cockpit"
        description="Top signals from the market screener, your personal watchlist, and a clickable history. Each panel pulls from a different source."
        stats={[
          { label: "Active List", value: watchlistOptions.find((w) => w.id === activeWatchlistId)?.name ?? "—", tone: "brand" },
          { label: "Symbols", value: symbols.length },
          { label: "Selected", value: selectedSymbol ?? "—" },
          { label: "Desk Tempo", value: isAnyLoading ? "Refreshing" : "Stable", tone: isAnyLoading ? "brand" : "bullish" },
        ]}
        actions={
          <button
            type="button"
            onClick={() => setFocusMode(!focusMode)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              focusMode
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border bg-bg-secondary text-text-secondary hover:text-text-primary hover:bg-bg-hover"
            }`}
            title={focusMode ? "Show the sidebar" : "Hide the sidebar for more chart space"}
            aria-pressed={focusMode}
          >
            <Focus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {focusMode ? "Exit focus" : "Focus mode"}
            </span>
          </button>
        }
      />

      <div className="min-h-[760px] flex-1 overflow-hidden rounded-xl border border-border bg-bg-surface shadow-2xl">
        {/* ─── Mobile ─── */}
        <div className="flex flex-col lg:hidden flex-1 min-h-0 overflow-y-auto">
          <div className="shrink-0 border-b border-border bg-bg-secondary">
            <div className="flex items-center gap-2 overflow-x-auto px-4 py-3">
              <span className="text-[10px] uppercase tracking-wider text-text-muted shrink-0">
                Watchlist
              </span>
              {symbols.length === 0 ? (
                <span className="text-xs text-text-muted">Empty — add symbols below</span>
              ) : (
                symbols.slice(0, 12).map((sym) => {
                  const isSelected = selectedSymbol === sym;
                  return (
                    <button
                      key={sym}
                      onClick={() => handleSelectSignal(sym)}
                      className={`shrink-0 flex min-h-[38px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-mono transition-all
                        ${isSelected ? "bg-accent/15 text-accent border-accent/30" : "bg-bg-secondary text-text-secondary border-border hover:border-border-hover"}`}
                    >
                      {sym}
                    </button>
                  );
                })
              )}

              <button
                onClick={() => setShowAddInput(!showAddInput)}
                aria-label="Add symbol to watchlist"
                className="shrink-0 flex h-11 w-11 items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:border-accent/30 hover:text-accent"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {showAddInput && (
              <div className="flex gap-2 px-4 pb-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="text"
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddSymbol(newSymbol); }}
                    placeholder="Add to watchlist..."
                    maxLength={10}
                    autoFocus
                    className="w-full rounded-lg border border-border bg-bg-elevated pl-10 pr-3 py-2
                      text-sm text-text-primary placeholder:text-text-muted font-mono
                      focus:outline-none focus:border-accent/50 min-h-[44px]"
                  />
                </div>
                <Button size="md" onClick={() => handleAddSymbol(newSymbol)}>
                  Add
                </Button>
                <button
                  onClick={() => { setShowAddInput(false); setNewSymbol(""); }}
                  className="rounded-[14px] p-2 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="shrink-0 border-b border-border p-3">
            {selectedAnalysis && selectedAnalysis.bars?.length > 0 ? (
              <PriceChart analysis={selectedAnalysis} height={280} events={chartEvents} />
            ) : isSelectedLoading ? (
              <div className="flex items-center justify-center h-[280px]">
                <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              </div>
            ) : (
              <MobileEmptyState hasSymbols={symbols.length > 0} onAddSymbol={handleAddSymbol} />
            )}
          </div>

          {selectedSymbol && (
            <div className="shrink-0 h-[300px] border-b border-border">
              <IntelligenceTabs symbol={selectedSymbol} analysis={selectedAnalysis} />
            </div>
          )}

          <div className="flex-1">
            <SignalDetails analysis={selectedAnalysis} loading={isSelectedLoading} />
          </div>
        </div>

        {/* ─── Desktop layout: chart on top, panels below ───
         *
         * 2026-05-13 evening: user wanted the chart promoted from the
         * cramped center column to a full-width top section, with
         * everything else underneath.
         *
         *   ┌────────────────────────────────────────┐
         *   │              CHART                     │  ← responsive height
         *   ├──────────┬─────────────────┬───────────┤
         *   │watchlist │  intelligence   │  details  │  ← grid row
         *   └──────────┴─────────────────┴───────────┘
         *
         * First attempt used a 2-row grid with 60/40 percent heights.
         * That dragged the chart row to monstrous heights (3+
         * viewports) because the panel row has tall intrinsic content
         * (signal details panel = full DNA + indicators + risk +
         * hybrid layers), so the workspace stretched and the chart
         * proportionally followed.
         *
         * Fix: ditch the grid-row split. Use two stacked sections.
         * Chart gets a clamp() height tied to viewport so it
         * never exceeds ~55vh on laptops, never goes below 380px on
         * very short screens. Panels row gets its own bounded height.
         *
         *   - SignalFeed panel was removed earlier (user picked Option A).
         *   - Charts use height='fill' so they grow into the section's
         *     allocated space (PriceChart + TradingViewChart both honor it).
         */}
        <div className="hidden lg:flex flex-1 min-h-0 flex-col">
          {/* ───── Section 1: Chart (full width, bounded height) ───── */}
          <div
            className="shrink-0 border-b border-border overflow-hidden p-3 flex flex-col"
            style={{
              // clamp(min, preferred, max):
              //   - 340px floor: chart stays usable on shorter laptop screens
              //   - 48vh preferred: leaves ~50vh of viewport for the panels
              //     and the page header above; total page height stays close
              //     to one viewport on standard 1080p/1440p displays
              //   - 580px ceiling: on tall monitors, don't waste space on a
              //     chart bigger than what fits a candlestick view nicely
              height: "clamp(340px, 48vh, 580px)",
            }}
          >
            {/* Chart engine toggle + fullscreen button */}
            {selectedSymbol && (
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-xs text-text-muted">
                  <span className="font-mono font-semibold text-text-primary">{selectedSymbol}</span>
                  {selectedAnalysis && typeof selectedAnalysis.price === "number" && (
                    <span className="ml-2">
                      ${selectedAnalysis.price.toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5 rounded-lg border border-border p-0.5 bg-bg-secondary">
                    <button
                      onClick={() => switchChartMode("engine")}
                      className={`rounded-md px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide transition-colors
                        ${chartMode === "engine"
                          ? "bg-bg-elevated text-text-primary"
                          : "text-text-muted hover:text-text-secondary"
                        }`}
                      title="Beacontry's chart with signal/earnings markers"
                    >
                      Engine view
                    </button>
                    <button
                      onClick={() => switchChartMode("tradingview")}
                      className={`rounded-md px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide transition-colors
                        ${chartMode === "tradingview"
                          ? "bg-bg-elevated text-text-primary"
                          : "text-text-muted hover:text-text-secondary"
                        }`}
                      title="TradingView Advanced Chart with full drawing tools"
                    >
                      TradingView
                    </button>
                  </div>
                  <button
                    onClick={() => setChartFullscreen(true)}
                    className="rounded-md border border-border bg-bg-secondary p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
                    title="Expand chart to full screen (Esc to exit)"
                    aria-label="Expand chart to full screen"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
            {/* While the overlay is open, render a placeholder
             * instead of the live chart — only ONE
             * TradingView/PriceChart instance exists at a time
             * so the in-page panel doesn't drift. */}
            {chartFullscreen ? (
              <div className="flex-1 min-h-0 flex items-center justify-center rounded-lg border border-dashed border-border bg-bg-secondary">
                <p className="text-xs text-text-muted">Chart open in fullscreen — Esc to return</p>
              </div>
            ) : selectedSymbol && chartMode === "tradingview" ? (
              <div className="flex-1 min-h-0">
                <TradingViewChart symbol={selectedSymbol} interval="D" height="fill" />
              </div>
            ) : selectedAnalysis && selectedAnalysis.bars?.length > 0 ? (
              <div className="flex-1 min-h-0">
                <PriceChart analysis={selectedAnalysis} height="fill" events={chartEvents} />
              </div>
            ) : isSelectedLoading ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-border bg-bg-secondary">
                <div className="text-center">
                  <div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
                  <p className="text-sm text-text-secondary">Analyzing {selectedSymbol}...</p>
                </div>
              </div>
            ) : (
              <DesktopEmptyState
                hasSymbols={symbols.length > 0}
                selectedSymbol={selectedSymbol}
                onAddSymbol={handleAddSymbol}
              />
            )}
          </div>

          {/* ───── Section 2: Watchlist + Intelligence + Details ─────
           *
           * Three columns sharing whatever viewport height remains
           * after the chart. `flex-1 min-h-0` lets the panels absorb
           * the remainder. `min-h-[320px]` is the panel-minimum on
           * very short screens (causes a small page scroll there,
           * acceptable). Each child column manages its own internal
           * overflow so the whole section never causes the page
           * itself to scroll on standard ≥1080p displays.
           */}
          <div
            className="grid flex-1 min-h-[320px]"
            style={{
              gridTemplateColumns: "18rem minmax(0,1fr) 26rem",
            }}
          >
          {/* Left: Watchlist + add controls */}
          <div className="flex min-h-0 flex-col border-r border-border bg-bg-secondary">
                {/* Add to watchlist (top) — moved here from the bottom
                 * 2026-05-13. Sits above the watchlist list so users
                 * don't have to scroll past everything to add a symbol.
                 * Popular-symbol chips appear inline when the list is
                 * empty (first-run guidance). */}
                <div className="shrink-0 space-y-2 border-b border-border p-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddSymbol(newSymbol);
                    }}
                    className="flex gap-2"
                  >
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                      <input
                        type="text"
                        value={newSymbol}
                        onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                        placeholder="Add to watchlist..."
                        maxLength={10}
                        className="w-full rounded-lg border border-border bg-bg-elevated pl-9 pr-3 py-1.5
                          text-xs text-text-primary placeholder:text-text-muted font-mono
                          focus:outline-none focus:border-accent/50 min-h-[38px]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!newSymbol.trim()}
                      className="min-h-[38px] rounded-lg border border-border px-2.5 py-1.5 text-text-muted
                        transition-colors hover:border-accent/30 hover:text-accent disabled:opacity-30
                        disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </form>

                  {symbols.length === 0 && (
                    <div className="flex flex-wrap gap-1">
                      {POPULAR_SYMBOLS.map((sym) => (
                        <button
                          key={sym}
                          onClick={() => handleAddSymbol(sym)}
                          className="rounded-full border border-border px-2.5 py-1 text-[10px] font-mono
                            text-text-muted transition-colors hover:border-accent/30 hover:text-accent"
                        >
                          + {sym}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-h-0 overflow-hidden">
                  <CockpitWatchlist
                    symbols={symbols}
                    selectedSymbol={selectedSymbol}
                    onSelectSymbol={handleSelectSignal}
                    onRemoveSymbol={handleRemoveSymbol}
                    analyses={watchlistAnalyses}
                    loading={isAnyLoading}
                    watchlistOptions={watchlistOptions}
                    activeWatchlistId={activeWatchlistId}
                    onSwitchWatchlist={switchToList}
                    recentEntries={recentEntries}
                  />
                </div>

                {/* Selection actions — Refresh + Trade. Stays at the
                 * bottom because they only apply when a symbol is
                 * selected, so they're contextual rather than primary. */}
                {selectedSymbol && (
                  <div className="shrink-0 space-y-2 border-t border-border p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          if (selectedSymbol) analyzeSymbol(selectedSymbol);
                        }}
                        disabled={isSelectedLoading}
                        className="flex min-h-[38px] items-center justify-center gap-1.5 rounded-[16px]
                          border border-border px-3 py-1.5 text-xs text-text-muted transition-colors
                          hover:border-accent/30 hover:text-accent disabled:opacity-30"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSelectedLoading ? "animate-spin" : ""}`} />
                        Refresh
                      </button>
                      <Link
                        href={`/dashboard/trade/${encodeURIComponent(selectedSymbol)}`}
                        className="flex min-h-[38px] items-center justify-center gap-1.5 rounded-[16px]
                          border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs text-accent transition-colors
                          hover:bg-accent/20"
                      >
                        Trade
                      </Link>
                    </div>
                  </div>
                )}
          </div>

          {/* Center: Intelligence tabs */}
          <div className="min-w-0 min-h-0 overflow-hidden">
            <IntelligenceTabs symbol={selectedSymbol} analysis={selectedAnalysis} />
          </div>

          {/* Right: Signal details */}
          <div className="min-h-0 overflow-y-auto border-l border-border bg-bg-secondary">
            <SignalDetails analysis={selectedAnalysis} loading={isSelectedLoading} />
          </div>
          </div>
        </div>
      </div>

      {/* Chart fullscreen overlay. The in-page chart is replaced with
       * a placeholder while this is open (see chartFullscreen check
       * above) so only ONE chart instance exists. The overlay also
       * compensates for scrollbar width via body paddingRight to keep
       * the PanelGroup from drifting. */}
      <ChartFullscreenOverlay
        open={chartFullscreen}
        onClose={() => setChartFullscreen(false)}
        title={selectedSymbol ? `${selectedSymbol} — ${chartMode === "tradingview" ? "TradingView" : "Engine view"}` : "Chart"}
      >
        {selectedSymbol && chartMode === "tradingview" ? (
          <div className="w-full h-full">
            <TradingViewChart symbol={selectedSymbol} interval="D" height="fill" />
          </div>
        ) : selectedAnalysis && selectedAnalysis.bars?.length > 0 ? (
          <div className="w-full h-full p-3">
            <PriceChart analysis={selectedAnalysis} height="fill" events={chartEvents} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-text-muted">No chart data available</p>
          </div>
        )}
      </ChartFullscreenOverlay>
    </div>
  );
}

// ─── Empty States ──────────────────────────────────────────────

function DesktopEmptyState({
  hasSymbols,
  selectedSymbol,
  onAddSymbol,
}: {
  hasSymbols: boolean;
  selectedSymbol: string | null;
  onAddSymbol: (sym: string) => void;
}) {
  if (hasSymbols && selectedSymbol) {
    return (
      <div className="flex items-center justify-center h-full rounded-lg border border-border bg-bg-surface">
        <div className="text-center">
          <Activity className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary">
            Loading analysis for {selectedSymbol}...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full rounded-lg border border-border bg-bg-surface">
      <div className="text-center max-w-sm">
        <Crosshair className="w-12 h-12 text-text-muted mx-auto mb-4" />
        <h3 className="font-display text-lg font-semibold mb-2">Trading Cockpit</h3>
        <p className="text-sm text-text-secondary mb-6">
          Click a market signal to analyze it, or build your own watchlist for personalized tracking.
        </p>
        {!hasSymbols && (
          <div className="flex flex-wrap gap-2 justify-center">
            {POPULAR_SYMBOLS.map((sym) => (
              <button
                key={sym}
                onClick={() => onAddSymbol(sym)}
                className="px-3 py-2 rounded-lg text-xs font-mono border border-border
                  text-text-secondary hover:text-accent hover:border-accent
                  transition-colors min-h-[44px]"
              >
                + {sym}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MobileEmptyState({
  hasSymbols,
  onAddSymbol,
}: {
  hasSymbols: boolean;
  onAddSymbol: (sym: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-[280px] text-center px-4">
      <Crosshair className="w-10 h-10 text-text-muted mb-3" />
      <p className="text-sm font-medium text-text-secondary mb-1">
        {hasSymbols ? "Select a signal" : "Tap a market signal or add symbols"}
      </p>
      <p className="text-xs text-text-muted mb-4">
        {hasSymbols
          ? "Tap a signal above to view analysis"
          : "Market signals come from the screener; your watchlist is yours to curate"}
      </p>
      {!hasSymbols && (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {POPULAR_SYMBOLS.map((sym) => (
            <button
              key={sym}
              onClick={() => onAddSymbol(sym)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-mono border border-border
                text-text-muted hover:text-accent hover:border-accent transition-colors
                min-h-[36px]"
            >
              + {sym}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
