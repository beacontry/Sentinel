"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro } from "@/components/layout/page-intro";
import { Activity, Filter } from "lucide-react";
import { SymbolPreviewSheet } from "@/components/ui/symbol-preview-sheet";

interface SymbolActivity {
  symbol: string;
  sector: string;
  price: number;
  priceChange: number;
  todayVolume: number;
  avgVolume20: number;
  volumeRatio: number;
  unusual: boolean;
}

interface ActivityData {
  symbols: SymbolActivity[];
  scanned: number;
  unusualCount: number;
  timestamp: string;
}

function formatVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

export default function UnusualActivityPage() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  // Quick-info drawer state — opens when the user clicks a ticker row.
  // Previously the symbol cell was plain text with no affordance.
  const [previewSymbol, setPreviewSymbol] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/unusual-activity");
        if (res.ok) setData(await res.json());
      } catch { /* handled */ }
      setLoading(false);
    }
    load();
  }, []);

  const filtered = data ? (showAll ? data.symbols : data.symbols.filter((s) => s.unusual)) : [];
  const highestRatio = data?.symbols[0]?.volumeRatio ?? 0;

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PageIntro
        eyebrow="Market Intelligence"
        title="Unusual Activity"
        description="Volume spikes and unusual trading activity across tracked symbols. Flags stocks with volume 2x+ above their 20-day average."
        stats={[
          { label: "Scanned", value: String(data?.scanned ?? 0) },
          { label: "Unusual", value: String(data?.unusualCount ?? 0), tone: "bearish" },
          { label: "Highest Ratio", value: `${highestRatio.toFixed(1)}x`, tone: "brand" },
          { label: "Updated", value: data ? new Date(data.timestamp).toLocaleTimeString() : "--" },
        ]}
      />

      <div className="flex items-center gap-2">
        <Button
          variant={showAll ? "secondary" : "primary"}
          size="sm"
          onClick={() => setShowAll(false)}
        >
          <Activity className="w-3.5 h-3.5" />
          Unusual Only ({data?.unusualCount ?? 0})
        </Button>
        <Button
          variant={showAll ? "primary" : "secondary"}
          size="sm"
          onClick={() => setShowAll(true)}
        >
          <Filter className="w-3.5 h-3.5" />
          Show All ({data?.scanned ?? 0})
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-left">
                <th className="pb-2 pr-4 font-medium">Symbol</th>
                <th className="pb-2 pr-4 font-medium">Sector</th>
                <th className="pb-2 pr-4 font-medium text-right">Price</th>
                <th className="pb-2 pr-4 font-medium text-right">Change</th>
                <th className="pb-2 pr-4 font-medium text-right">Volume</th>
                <th className="pb-2 pr-4 font-medium text-right">Avg Vol</th>
                <th className="pb-2 pr-4 font-medium text-right">Ratio</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.symbol}
                  className={`border-b border-border/50 cursor-pointer hover:bg-bg-hover transition-colors ${s.unusual ? "bg-warning/5" : ""}`}
                  onClick={() => setPreviewSymbol(s.symbol)}
                  title="Click for quick info"
                >
                  <td className="py-2 pr-4 font-mono font-medium text-accent hover:underline">{s.symbol}</td>
                  <td className="py-2 pr-4 text-text-secondary">{s.sector}</td>
                  <td className="py-2 pr-4 text-right font-mono">${s.price.toFixed(2)}</td>
                  <td className={`py-2 pr-4 text-right font-mono ${s.priceChange >= 0 ? "text-bullish" : "text-bearish"}`}>
                    {s.priceChange >= 0 ? "+" : ""}{s.priceChange.toFixed(2)}%
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-text-primary">{formatVolume(s.todayVolume)}</td>
                  <td className="py-2 pr-4 text-right font-mono text-text-muted">{formatVolume(s.avgVolume20)}</td>
                  <td className={`py-2 pr-4 text-right font-mono font-medium ${s.volumeRatio >= 3 ? "text-bearish" : s.volumeRatio >= 2 ? "text-warning" : "text-text-secondary"}`}>
                    {s.volumeRatio.toFixed(1)}x
                  </td>
                  <td className="py-2">
                    {s.volumeRatio >= 3 ? (
                      <Badge variant="bearish">Extreme</Badge>
                    ) : s.volumeRatio >= 2 ? (
                      <Badge variant="warning">Unusual</Badge>
                    ) : (
                      <Badge variant="neutral">Normal</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-text-muted">
                    No unusual activity detected today.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Symbol quick-info drawer — opens on row click. Reusable component
       * that any page with a ticker list can adopt without per-page setup
       * beyond passing the selected symbol + close handler. */}
      <SymbolPreviewSheet
        symbol={previewSymbol}
        onClose={() => setPreviewSymbol(null)}
      />
    </div>
  );
}
