"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro } from "@/components/layout/page-intro";
import { RefreshCw } from "lucide-react";
import { PaywallBanner } from "@/components/tiers/paywall-banner";

interface SectorData {
  name: string;
  perf1w: number;
  perf1m: number;
  perf3m: number;
  momentum: number;
  phase: "leading" | "weakening" | "lagging" | "improving";
  topSymbol: string;
  topSymbolPerf: number;
}

interface RotationData {
  sectors: SectorData[];
  asOf: string;
}

const phaseConfig = {
  leading:   { label: "Leading",   color: "text-bullish",  bg: "bg-bullish/10 border-bullish/20", desc: "Strong performance, gaining momentum" },
  weakening: { label: "Weakening", color: "text-warning",  bg: "bg-warning/10 border-warning/20",  desc: "Positive but losing steam" },
  lagging:   { label: "Lagging",   color: "text-bearish",  bg: "bg-bearish/10 border-bearish/20",  desc: "Weak performance, still declining" },
  improving: { label: "Improving", color: "text-accent",   bg: "bg-accent/10 border-accent/20",    desc: "Negative but momentum turning up" },
};

export default function SectorRotationPage() {
  const [data, setData] = useState<RotationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/sector-rotation");
        if (res.ok) setData(await res.json());
      } catch { /* handled */ }
      setLoading(false);
    }
    load();
  }, []);

  const byPhase = (phase: string) => data?.sectors.filter((s) => s.phase === phase) ?? [];

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
      <PaywallBanner minTier="trader" featureName="Sector Rotation" />
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const leading = byPhase("leading");
  const bestSector = data?.sectors[0];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PageIntro
        eyebrow="Market Analysis"
        title="Sector Rotation"
        description="Track money flow between sectors over rolling periods. Identify which sectors are leading, lagging, improving, or weakening."
        stats={[
          { label: "Leading", value: String(leading.length), tone: "bullish" },
          { label: "Lagging", value: String(byPhase("lagging").length), tone: "bearish" },
          { label: "Best Sector", value: bestSector?.name ?? "--", tone: "brand" },
          { label: "Sectors", value: String(data?.sectors.length ?? 0) },
        ]}
      />

      {data && (
        <>
          {/* Quadrant view */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(["leading", "weakening", "improving", "lagging"] as const).map((phase) => {
              const config = phaseConfig[phase];
              const sectors = byPhase(phase);
              return (
                <Card key={phase} className={`border ${config.bg}`}>
                  <CardHeader className="p-0 pb-2">
                    <CardTitle className={`flex items-center gap-2 ${config.color}`}>
                      <RefreshCw className="w-4 h-4" />
                      {config.label}
                    </CardTitle>
                    <p className="text-xs text-text-muted">{config.desc}</p>
                  </CardHeader>
                  <div className="flex flex-wrap gap-2 min-h-[40px]">
                    {sectors.length === 0 ? (
                      <span className="text-xs text-text-muted">No sectors in this phase</span>
                    ) : (
                      sectors.map((s) => (
                        <Badge key={s.name} variant={phase === "leading" ? "bullish" : phase === "lagging" ? "bearish" : "warning"}>
                          {s.name}
                        </Badge>
                      ))
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Detailed table */}
          <Card>
            <CardHeader className="p-0 pb-3">
              <CardTitle>Sector Performance Detail</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted text-left">
                    <th className="pb-2 pr-4 font-medium">Sector</th>
                    <th className="pb-2 pr-4 font-medium text-right">1W</th>
                    <th className="pb-2 pr-4 font-medium text-right">1M</th>
                    <th className="pb-2 pr-4 font-medium text-right">3M</th>
                    <th className="pb-2 pr-4 font-medium text-right">Momentum</th>
                    <th className="pb-2 pr-4 font-medium">Phase</th>
                    <th className="pb-2 font-medium">Top Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sectors.map((s) => (
                    <tr key={s.name} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-medium text-text-primary">{s.name}</td>
                      <td className={`py-2 pr-4 text-right font-mono ${s.perf1w >= 0 ? "text-bullish" : "text-bearish"}`}>
                        {s.perf1w >= 0 ? "+" : ""}{s.perf1w.toFixed(2)}%
                      </td>
                      <td className={`py-2 pr-4 text-right font-mono ${s.perf1m >= 0 ? "text-bullish" : "text-bearish"}`}>
                        {s.perf1m >= 0 ? "+" : ""}{s.perf1m.toFixed(2)}%
                      </td>
                      <td className={`py-2 pr-4 text-right font-mono ${s.perf3m >= 0 ? "text-bullish" : "text-bearish"}`}>
                        {s.perf3m >= 0 ? "+" : ""}{s.perf3m.toFixed(2)}%
                      </td>
                      <td className={`py-2 pr-4 text-right font-mono ${s.momentum >= 0 ? "text-bullish" : "text-bearish"}`}>
                        {s.momentum >= 0 ? "+" : ""}{s.momentum.toFixed(2)}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={s.phase === "leading" ? "bullish" : s.phase === "lagging" ? "bearish" : "warning"}>
                          {phaseConfig[s.phase].label}
                        </Badge>
                      </td>
                      <td className="py-2 font-mono text-text-secondary">
                        {s.topSymbol} <span className={s.topSymbolPerf >= 0 ? "text-bullish" : "text-bearish"}>
                          ({s.topSymbolPerf >= 0 ? "+" : ""}{s.topSymbolPerf.toFixed(1)}%)
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
