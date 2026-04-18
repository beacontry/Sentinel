"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { Grid3X3 } from "lucide-react";

interface HeatmapSymbol {
  symbol: string;
  price: number;
  changePct: number;
}

interface Sector {
  name: string;
  symbols: HeatmapSymbol[];
}

function getColor(changePct: number): string {
  if (changePct >= 3) return "bg-bullish";
  if (changePct >= 1.5) return "bg-bullish/80";
  if (changePct >= 0.5) return "bg-bullish/60";
  if (changePct > -0.5) return "bg-bg-elevated";
  if (changePct > -1.5) return "bg-bearish/60";
  if (changePct > -3) return "bg-bearish/80";
  return "bg-bearish";
}

export default function HeatmapPage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/heatmap");
        if (res.ok) {
          const data = await res.json();
          setSectors(data.sectors ?? []);
        }
      } catch {
        // Silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.analysis} />
      <PageIntro
        eyebrow="Market Analysis"
        title="Heatmap"
        description="Visual snapshot of daily sector pressure and individual stock performance."
        stats={[
          { label: "Sectors", value: String(sectors.length) },
          { label: "Symbols", value: String(sectors.reduce((sum, s) => sum + s.symbols.length, 0)) },
          {
            label: "Gainers",
            value: String(sectors.reduce((sum, s) => sum + s.symbols.filter((sym) => sym.changePct > 0).length, 0)),
            tone: "bullish",
          },
          {
            label: "Losers",
            value: String(sectors.reduce((sum, s) => sum + s.symbols.filter((sym) => sym.changePct < 0).length, 0)),
            tone: "bearish",
          },
        ]}
      />

      {sectors.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-surface p-12 text-center">
          <Grid3X3 className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <p className="text-sm text-text-secondary">
            No heatmap data available
          </p>
        </div>
      ) : (
        sectors.map((sector) => (
          <Card key={sector.name}>
            <CardHeader className="p-0 pb-3">
              <CardTitle className="text-base">{sector.name}</CardTitle>
            </CardHeader>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5">
              {sector.symbols.map((s) => (
                <div
                  key={s.symbol}
                  className={`${getColor(s.changePct)} rounded-lg p-2.5 text-center transition-all
                    hover:scale-105 cursor-default`}
                >
                  <p className="text-xs font-mono font-bold text-text-primary">
                    {s.symbol}
                  </p>
                  <p className="text-[10px] font-mono text-text-primary/70">
                    ${s.price.toFixed(2)}
                  </p>
                  <p
                    className={`text-xs font-mono font-bold ${s.changePct >= 0 ? "text-bullish" : "text-bearish"}`}
                  >
                    {s.changePct >= 0 ? "+" : ""}
                    {s.changePct.toFixed(2)}%
                  </p>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
