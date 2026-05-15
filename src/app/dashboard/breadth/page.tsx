"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { PaywallBanner } from "@/components/tiers/paywall-banner";

interface BreadthData {
  scanned: number;
  advancers: number;
  decliners: number;
  unchanged: number;
  pctAbove50: number;
  pctAbove200: number;
  avgRSI: number;
  breadthScore: number;
  marketStatus: "strong" | "neutral" | "weak";
  bySector: { sector: string; advancers: number; decliners: number; avgChange: number }[];
}

const statusConfig = {
  strong: { label: "STRONG", variant: "bullish" as const, color: "text-bullish" },
  neutral: { label: "NEUTRAL", variant: "warning" as const, color: "text-warning" },
  weak: { label: "WEAK", variant: "bearish" as const, color: "text-bearish" },
};

export default function BreadthPage() {
  const [data, setData] = useState<BreadthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/breadth");
        if (res.ok) setData(await res.json());
      } catch { /* handled by empty state */ }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <SubNav tabs={SUB_NAV.analysis} />
      <PaywallBanner minTier="trader" featureName="Market Breadth" />
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.analysis} />
      <PageIntro
        eyebrow="Market Analysis"
        title="Market Breadth"
        description="Advance/decline ratios, moving average participation, and sector-level internals across tracked stocks."
        stats={[
          { label: "Breadth Score", value: data ? String(data.breadthScore) : "--", tone: "brand" },
          { label: "Advancers", value: data ? String(data.advancers) : "--", tone: "bullish" },
          { label: "Decliners", value: data ? String(data.decliners) : "--", tone: "bearish" },
          { label: "Avg RSI", value: data ? String(data.avgRSI) : "--" },
        ]}
      />

      {data && (
        <>
          {/* Market status */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-text-muted">Market Status:</span>
            <Badge variant={statusConfig[data.marketStatus].variant}>
              {statusConfig[data.marketStatus].label}
            </Badge>
            <span className="text-sm text-text-secondary">
              {data.scanned} stocks scanned
            </span>
          </div>

          {/* A/D Ratio Bar */}
          <Card>
            <CardHeader className="p-0 pb-3">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-text-muted" />
                Advance / Decline
              </CardTitle>
            </CardHeader>
            <div className="space-y-3">
              <div className="flex rounded-lg overflow-hidden h-8">
                <div
                  className="bg-bullish/80 flex items-center justify-center text-xs font-mono font-medium text-white transition-all"
                  style={{ width: `${data.scanned > 0 ? (data.advancers / data.scanned) * 100 : 50}%` }}
                >
                  {data.advancers}
                </div>
                {data.unchanged > 0 && (
                  <div
                    className="bg-bg-elevated flex items-center justify-center text-xs font-mono text-text-muted transition-all"
                    style={{ width: `${(data.unchanged / data.scanned) * 100}%` }}
                  >
                    {data.unchanged}
                  </div>
                )}
                <div
                  className="bg-bearish/80 flex items-center justify-center text-xs font-mono font-medium text-white transition-all"
                  style={{ width: `${data.scanned > 0 ? (data.decliners / data.scanned) * 100 : 50}%` }}
                >
                  {data.decliners}
                </div>
              </div>
              <div className="flex justify-between text-[11px] text-text-muted">
                <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-bullish" /> Advancers</span>
                <span className="flex items-center gap-1"><TrendingDown className="w-3 h-3 text-bearish" /> Decliners</span>
              </div>
            </div>
          </Card>

          {/* SMA Participation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "% Above 50-Day SMA", value: data.pctAbove50 },
              { label: "% Above 200-Day SMA", value: data.pctAbove200 },
            ].map((item) => (
              <Card key={item.label}>
                <div className="text-center py-2">
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted mb-2">
                    {item.label}
                  </div>
                  <div className={`text-4xl font-mono font-semibold ${item.value >= 60 ? "text-bullish" : item.value >= 40 ? "text-warning" : "text-bearish"}`}>
                    {item.value}%
                  </div>
                  <div className="mt-3 mx-auto w-full max-w-[200px] h-2 rounded-full bg-bg-elevated overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${item.value >= 60 ? "bg-bullish" : item.value >= 40 ? "bg-warning" : "bg-bearish"}`}
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Sector breakdown */}
          <Card>
            <CardHeader className="p-0 pb-3">
              <CardTitle>Sector Breakdown</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted text-left">
                    <th className="pb-2 pr-4 font-medium">Sector</th>
                    <th className="pb-2 pr-4 font-medium text-right">Adv</th>
                    <th className="pb-2 pr-4 font-medium text-right">Dec</th>
                    <th className="pb-2 font-medium text-right">Avg Change</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySector.map((s) => (
                    <tr key={s.sector} className="border-b border-border/50">
                      <td className="py-2 pr-4 text-text-primary font-medium">{s.sector}</td>
                      <td className="py-2 pr-4 text-right font-mono text-bullish">{s.advancers}</td>
                      <td className="py-2 pr-4 text-right font-mono text-bearish">{s.decliners}</td>
                      <td className={`py-2 text-right font-mono ${s.avgChange >= 0 ? "text-bullish" : "text-bearish"}`}>
                        {s.avgChange >= 0 ? "+" : ""}{s.avgChange.toFixed(2)}%
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
