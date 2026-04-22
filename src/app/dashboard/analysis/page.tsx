"use client";

import { useState, useEffect, useCallback } from "react";
import type { AnalysisResult } from "@/types";
import { SignalFeed, type SignalFeedItem } from "@/components/dashboard/signal-feed";
import { SignalDetails } from "@/components/dashboard/signal-details";
import { PriceChart, type ChartEvent } from "@/components/dashboard/price-chart";
import { IntelligenceTabs } from "@/components/dashboard/intelligence-tabs";
import { CockpitWatchlist } from "@/components/dashboard/cockpit-watchlist";
import { PageIntro } from "@/components/layout/page-intro";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import {
  Activity,
  Plus,
  Search,
  X,
  Crosshair,
  RefreshCw,
} from "lucide-react";

const POPULAR_SYMBOLS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN"];

export default function AnalysisCockpit() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, AnalysisResult>>({});
  const [analyzingSymbols, setAnalyzingSymbols] = useState<Set<string>>(
    new Set()
  );
  const [initialLoad, setInitialLoad] = useState(true);
  const [chartEvents, setChartEvents] = useState<ChartEvent[]>([]);
  const [newSymbol, setNewSymbol] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);

  // Load watchlist on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/watchlist");
        if (res.ok) {
          const data = await res.json();
          const syms: string[] = data.symbols ?? [];
          setSymbols(syms);
        }
      } catch {
        // Watchlist empty on first load
      } finally {
        setInitialLoad(false);
      }
    }
    load();
  }, []);

  // Analyze a single symbol
  const analyzeSymbol = useCallback(async (symbol: string) => {
    setAnalyzingSymbols((prev) => new Set(prev).add(symbol));
    try {
      const res = await fetch(`/api/analyze/${encodeURIComponent(symbol)}`);
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

  // Analyze all watchlist symbols on load
  useEffect(() => {
    if (!initialLoad && symbols.length > 0) {
      for (const sym of symbols) {
        if (!analyses[sym]) {
          analyzeSymbol(sym);
        }
      }
    }
    // Only run when initialLoad changes to false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoad]);

  // Auto-select first symbol once analyses are available
  useEffect(() => {
    if (!selectedSymbol && symbols.length > 0) {
      setSelectedSymbol(symbols[0]);
    }
  }, [symbols, selectedSymbol]);

  // Fetch earnings for chart markers when selected symbol changes
  useEffect(() => {
    if (!selectedSymbol) {
      setChartEvents([]);
      return;
    }
    async function fetchEarnings() {
      try {
        const res = await fetch(
          `/api/earnings?symbols=${encodeURIComponent(selectedSymbol!)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.earnings?.length > 0) {
          setChartEvents(
            data.earnings.map(
              (e: { date: string; hour: string }) => ({
                date:
                  e.date +
                  "T" +
                  (e.hour === "bmo" ? "09:30:00" : "16:00:00"),
                type: "earnings" as const,
                label: `Earnings ${e.hour === "bmo" ? "(Pre)" : e.hour === "amc" ? "(Post)" : ""}`,
              })
            )
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

  // Build signal feed items from analyses
  const signalItems: SignalFeedItem[] = symbols
    .filter((sym) => analyses[sym])
    .map((sym) => {
      const a = analyses[sym];
      const priceChange =
        a.indicators.sma_20 !== null
          ? ((a.price - a.indicators.sma_20) / a.indicators.sma_20) * 100
          : undefined;
      return {
        symbol: a.symbol,
        signal: a.signal,
        confidence: a.confidence,
        price: a.price,
        change: priceChange,
      };
    });

  // Build watchlist analysis lookup for CockpitWatchlist
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

  const selectedAnalysis = selectedSymbol
    ? analyses[selectedSymbol] ?? null
    : null;
  const isSelectedLoading = selectedSymbol
    ? analyzingSymbols.has(selectedSymbol)
    : false;
  const isAnyLoading = analyzingSymbols.size > 0;

  async function handleAddSymbol(symbol: string) {
    const sym = symbol.trim().toUpperCase();
    if (!sym || symbols.includes(sym)) return;

    setSymbols((prev) => [...prev, sym]);
    setSelectedSymbol(sym);
    setShowAddInput(false);
    setNewSymbol("");

    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: sym }),
    });

    analyzeSymbol(sym);
  }

  async function handleRemoveSymbol(symbol: string) {
    setSymbols((prev) => prev.filter((s) => s !== symbol));
    setAnalyses((prev) => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
    if (selectedSymbol === symbol) {
      setSelectedSymbol(symbols.find((s) => s !== symbol) ?? null);
    }

    await fetch("/api/watchlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
  }

  function handleSelectSignal(symbol: string) {
    setSelectedSymbol(symbol);
    if (!analyses[symbol]) {
      analyzeSymbol(symbol);
    }
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
      <SubNav tabs={SUB_NAV.analysis} />
      <PageIntro
        eyebrow="Research Desk"
        title="Analysis Cockpit"
        description="A tighter read on chart structure, signal conviction, and the qualitative context around every symbol in play."
        stats={[
          { label: "Watchlist", value: symbols.length },
          { label: "Loaded Analyses", value: Object.keys(analyses).length },
          { label: "Active Symbol", value: selectedSymbol ?? "None", tone: selectedSymbol ? "brand" : "neutral" },
          { label: "Desk Tempo", value: isAnyLoading ? "Refreshing" : "Stable", tone: isAnyLoading ? "brand" : "bullish" },
        ]}
      />

      <div className="min-h-[760px] flex-1 overflow-hidden rounded-xl border border-border bg-bg-surface shadow-2xl">
        <div className="flex flex-col lg:hidden flex-1 min-h-0 overflow-y-auto">
          <div className="shrink-0 border-b border-border bg-bg-secondary">
            <div className="flex items-center gap-2 overflow-x-auto px-4 py-3">
              <span className="text-[10px] uppercase tracking-wider text-text-muted shrink-0">
                Signals
              </span>
              {isAnyLoading && signalItems.length === 0 ? (
                <div className="flex gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton
                      key={i}
                      width="80px"
                      height="32px"
                      rounded="lg"
                    />
                  ))}
                </div>
              ) : signalItems.length === 0 ? (
                <span className="text-xs text-text-muted">
                  No signals -- add symbols below
                </span>
              ) : (
                signalItems.map((item) => {
                  const isSelected = selectedSymbol === item.symbol;
                  const isBull =
                    item.signal === "BUY" || item.signal === "STRONG_BUY";
                  const isBear =
                    item.signal === "SELL" || item.signal === "STRONG_SELL";
                  return (
                    <button
                      key={item.symbol}
                      onClick={() => handleSelectSignal(item.symbol)}
                      className={`shrink-0 flex min-h-[38px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-mono transition-all
                        ${
                          isSelected
                            ? "bg-accent/15 text-accent border-accent/30"
                            : "bg-bg-secondary text-text-secondary border-border hover:border-border-hover"
                        }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isBull
                            ? "bg-bullish"
                            : isBear
                              ? "bg-bearish"
                              : "bg-warning"
                        }`}
                      />
                      {item.symbol}
                      <span className="text-[10px] text-text-muted">
                        {Math.round(item.confidence * 100)}%
                      </span>
                    </button>
                  );
                })
              )}

              <button
                onClick={() => setShowAddInput(!showAddInput)}
                className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:border-accent/30 hover:text-accent"
              >
                <Plus className="w-4 h-4" />
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddSymbol(newSymbol);
                    }}
                    placeholder="Symbol..."
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
                  onClick={() => {
                    setShowAddInput(false);
                    setNewSymbol("");
                  }}
                  className="rounded-[14px] p-2 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="shrink-0 border-b border-border p-3">
            {selectedAnalysis && selectedAnalysis.bars?.length > 0 ? (
              <PriceChart
                analysis={selectedAnalysis}
                height={280}
                events={chartEvents}
              />
            ) : isSelectedLoading ? (
              <div className="flex items-center justify-center h-[280px]">
                <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              </div>
            ) : (
              <MobileEmptyState
                hasSymbols={symbols.length > 0}
                onAddSymbol={handleAddSymbol}
              />
            )}
          </div>

          {selectedSymbol && (
            <div className="shrink-0 h-[300px] border-b border-border">
              <IntelligenceTabs
                symbol={selectedSymbol}
                analysis={selectedAnalysis}
              />
            </div>
          )}

          <div className="flex-1">
            <SignalDetails
              analysis={selectedAnalysis}
              loading={isSelectedLoading}
            />
          </div>
        </div>

        <div
          className="hidden lg:grid flex-1 min-h-0"
          style={{
            gridTemplateColumns: "18rem minmax(0,1fr) 26rem",
            gridTemplateRows: "1fr",
            height: "100%",
          }}
        >
          <div className="flex min-h-0 flex-col border-r border-border bg-bg-secondary">
            <div className="flex-1 min-h-0 border-b border-border">
              <SignalFeed
                signals={signalItems}
                selectedSymbol={selectedSymbol}
                onSelectSignal={handleSelectSignal}
                loading={isAnyLoading}
              />
            </div>

            <div className="flex shrink-0 flex-col" style={{ maxHeight: "45%" }}>
              <div className="flex-1 min-h-0 overflow-hidden">
                <CockpitWatchlist
                  symbols={symbols}
                  selectedSymbol={selectedSymbol}
                  onSelectSymbol={handleSelectSignal}
                  onRemoveSymbol={handleRemoveSymbol}
                  analyses={watchlistAnalyses}
                  loading={isAnyLoading}
                />
              </div>

              <div className="shrink-0 space-y-2 border-t border-border p-3">
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
                      placeholder="Add..."
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

                {selectedSymbol && (
                  <button
                    onClick={() => {
                      if (selectedSymbol) analyzeSymbol(selectedSymbol);
                    }}
                    disabled={isSelectedLoading}
                    className="flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-[16px]
                      border border-border px-3 py-1.5 text-xs text-text-muted transition-colors
                      hover:border-accent/30 hover:text-accent disabled:opacity-30"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${isSelectedLoading ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </button>
                )}
              </div>
            </div>
          </div>

          <div
            className="min-w-0 min-h-0"
            style={{
              display: "grid",
              gridTemplateRows: "65% 35%",
              height: "100%",
            }}
          >
            <div className="min-h-0 overflow-hidden p-3">
              {selectedAnalysis && selectedAnalysis.bars?.length > 0 ? (
                <PriceChart
                  analysis={selectedAnalysis}
                  height={undefined}
                  events={chartEvents}
                />
              ) : isSelectedLoading ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-border bg-bg-secondary">
                  <div className="text-center">
                    <div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
                    <p className="text-sm text-text-secondary">
                      Analyzing {selectedSymbol}...
                    </p>
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

            <div className="min-h-0 overflow-hidden">
              <IntelligenceTabs
                symbol={selectedSymbol}
                analysis={selectedAnalysis}
              />
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto border-l border-border bg-bg-secondary">
            <SignalDetails
              analysis={selectedAnalysis}
              loading={isSelectedLoading}
            />
          </div>
        </div>
      </div>
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
        <h3 className="font-display text-lg font-semibold mb-2">
          Trading Cockpit
        </h3>
        <p className="text-sm text-text-secondary mb-6">
          Add symbols to your watchlist and Sentinel will run technical analysis
          automatically. Click a signal to view the chart and details.
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
        {hasSymbols ? "Select a signal" : "Add symbols to get started"}
      </p>
      <p className="text-xs text-text-muted mb-4">
        {hasSymbols
          ? "Tap a signal above to view analysis"
          : "Sentinel will analyze each symbol automatically"}
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
