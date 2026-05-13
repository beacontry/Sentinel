"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { Play, BarChart3, Maximize2, Minimize2 } from "lucide-react";

interface Trade {
  id?: string;
  symbol: string;
  action: string;
  fillPrice: number;
  fillTime: string;
  pnl: number | null;
  signal: string;
  status: string;
  quantity?: number;
}

export default function ReplayPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");
  const [bars, setBars] = useState<{ date: string; open: number; high: number; low: number; close: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartFullscreen, setChartFullscreen] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Esc to exit fullscreen + lock body scroll while fullscreen
  useEffect(() => {
    if (!chartFullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setChartFullscreen(false);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [chartFullscreen]);

  // When toggling fullscreen, lightweight-charts needs a tick to reflow
  // to the new container width. Trigger applyOptions explicitly.
  useEffect(() => {
    if (!chartRef.current || !chartContainerRef.current) return;
    const id = window.setTimeout(() => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    }, 50);
    return () => window.clearTimeout(id);
  }, [chartFullscreen]);
  const chartRef = useRef<ReturnType<typeof import("lightweight-charts").createChart> | null>(null);

  // Load trades
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/trader/dashboard");
        if (res.ok) {
          const data = await res.json();
          const allTrades: Trade[] = data.trades ?? [];
          const filled = allTrades.filter((t) => t.status === "FILLED" && t.fillPrice);
          setTrades(filled);
          const syms = [...new Set(filled.map((t) => t.symbol))];
          setSymbols(syms);
          if (syms.length > 0) setSelectedSymbol(syms[0]);
        }
      } catch { /* handled */ }
      setLoading(false);
    }
    load();
  }, []);

  const symbolTrades = trades.filter((t) => t.symbol === selectedSymbol);
  const totalTrades = trades.length;
  const wins = trades.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0;
  const bestTrade = trades.reduce((best, t) => ((t.pnl ?? 0) > (best.pnl ?? 0) ? t : best), trades[0]);

  // Load chart data when symbol changes
  const loadChart = useCallback(async () => {
    if (!selectedSymbol) return;
    setChartLoading(true);
    try {
      const res = await fetch(`/api/analyze?symbol=${selectedSymbol}`);
      if (res.ok) {
        const data = await res.json();
        setBars(data.bars ?? []);
      }
    } catch { /* handled */ }
    setChartLoading(false);
  }, [selectedSymbol]);

  useEffect(() => { loadChart(); }, [loadChart]);

  // Render chart
  useEffect(() => {
    if (!chartContainerRef.current || bars.length === 0) return;

    let chart: ReturnType<typeof import("lightweight-charts").createChart> | null = null;

    async function renderChart() {
      const lc = await import("lightweight-charts");
      if (!chartContainerRef.current) return;

      // Clean up previous
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      chart = lc.createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 450,
        layout: {
          background: { type: lc.ColorType.Solid, color: "#0d0f0e" },
          textColor: "#a3a8a5",
          fontFamily: "var(--font-geist-mono), monospace",
        },
        grid: {
          vertLines: { color: "#1a1d1b" },
          horzLines: { color: "#1a1d1b" },
        },
        crosshair: { mode: lc.CrosshairMode.Normal },
        timeScale: { borderColor: "#2a2d2b" },
        rightPriceScale: { borderColor: "#2a2d2b" },
      });

      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
        borderVisible: false,
      });

      const ohlcData = bars.map((b) => ({
        time: b.date.slice(0, 10) as unknown as import("lightweight-charts").Time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }));

      candleSeries.setData(ohlcData);

      // Add trade markers via price lines
      for (const trade of symbolTrades) {
        if (!trade.fillTime) continue;
        const isBuy = trade.action === "BUY" || trade.action === "buy";
        candleSeries.createPriceLine({
          price: trade.fillPrice,
          color: isBuy ? "#22c55e" : "#ef4444",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `${isBuy ? "BUY" : "SELL"} $${trade.fillPrice.toFixed(2)}`,
        });
      }

      chart.timeScale().fitContent();
      chartRef.current = chart;
    }

    renderChart();

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [bars, symbolTrades]);

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <SubNav tabs={SUB_NAV.trader} />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[450px] rounded-xl" />
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <SubNav tabs={SUB_NAV.trader} />
        <PageIntro eyebrow="Trade Review" title="Replay" description="Review past trade execution on price charts." />
        <EmptyState
          icon={<Play className="w-10 h-10" />}
          title="No trades yet"
          description="Start trading to review your execution with entry and exit markers on the chart."
        />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.trader} />
      <PageIntro
        eyebrow="Trade Review"
        title="Replay"
        description="Review past trade execution with entry and exit markers overlaid on price charts."
        stats={[
          { label: "Total Trades", value: String(totalTrades) },
          { label: "Win Rate", value: `${winRate}%`, tone: winRate >= 50 ? "bullish" : "bearish" },
          { label: "Best Trade", value: bestTrade ? `$${(bestTrade.pnl ?? 0).toFixed(2)}` : "--", tone: "bullish" },
          { label: "Symbols", value: String(symbols.length) },
        ]}
      />

      {/* Symbol selector */}
      <Card>
        <div className="flex flex-wrap gap-2">
          {symbols.map((sym) => (
            <Button
              key={sym}
              variant={sym === selectedSymbol ? "primary" : "secondary"}
              size="sm"
              onClick={() => setSelectedSymbol(sym)}
            >
              {sym}
              <span className="ml-1 text-xs opacity-70">
                ({trades.filter((t) => t.symbol === sym).length})
              </span>
            </Button>
          ))}
        </div>
      </Card>

      {/* Chart
       *
       * Fullscreen toggle uses fixed-position pinning on the Card itself
       * rather than a portal/overlay. Why: lightweight-charts attaches
       * via ref and a portal would require remounting the chart (re-fetch,
       * re-render, lose zoom state). Pinning lets the same DOM node grow
       * in place; the manual applyOptions({ width }) in the effect above
       * triggers a clean reflow.
       */}
      <Card
        className={
          chartFullscreen
            ? "fixed inset-0 z-[60] m-0 rounded-none bg-bg-primary p-4 flex flex-col"
            : undefined
        }
      >
        <CardHeader className="p-0 pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-text-muted" />
              {selectedSymbol} — Price Chart with Trade Markers
            </CardTitle>
            <button
              type="button"
              onClick={() => setChartFullscreen(!chartFullscreen)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
              title={chartFullscreen ? "Exit fullscreen (Esc)" : "Expand chart"}
              aria-label={chartFullscreen ? "Exit fullscreen" : "Expand chart"}
            >
              {chartFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{chartFullscreen ? "Exit" : "Expand"}</span>
            </button>
          </div>
        </CardHeader>
        {chartLoading ? (
          <Skeleton className={chartFullscreen ? "flex-1 rounded-lg" : "h-[450px] rounded-lg"} />
        ) : (
          <div
            ref={chartContainerRef}
            className={`w-full rounded-lg overflow-hidden ${chartFullscreen ? "flex-1 min-h-0" : ""}`}
          />
        )}
        <div className="mt-3 flex items-center gap-4 text-[10px] text-text-muted">
          <div className="flex items-center gap-1">
            <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[8px] border-l-transparent border-r-transparent border-b-bullish" />
            Buy Entry
          </div>
          <div className="flex items-center gap-1">
            <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[8px] border-l-transparent border-r-transparent border-t-bearish" />
            Sell Exit
          </div>
        </div>
      </Card>

      {/* Trade detail table */}
      <Card>
        <CardHeader className="p-0 pb-3">
          <CardTitle>Trade History — {selectedSymbol}</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-left">
                <th className="pb-2 pr-4 font-medium">Date</th>
                <th className="pb-2 pr-4 font-medium">Action</th>
                <th className="pb-2 pr-4 font-medium">Signal</th>
                <th className="pb-2 pr-4 font-medium text-right">Price</th>
                <th className="pb-2 font-medium text-right">P&L</th>
              </tr>
            </thead>
            <tbody>
              {symbolTrades.map((t, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-2 pr-4 font-mono text-text-secondary">
                    {t.fillTime ? new Date(t.fillTime).toLocaleDateString() : "--"}
                  </td>
                  <td className="py-2 pr-4">
                    <Badge variant={t.action === "BUY" || t.action === "buy" ? "bullish" : "bearish"}>
                      {t.action.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4 text-text-secondary">{t.signal}</td>
                  <td className="py-2 pr-4 text-right font-mono">${t.fillPrice.toFixed(2)}</td>
                  <td className={`py-2 text-right font-mono ${(t.pnl ?? 0) >= 0 ? "text-bullish" : "text-bearish"}`}>
                    {t.pnl !== null ? `${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}` : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
