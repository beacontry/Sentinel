"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { ShieldAlert, AlertTriangle } from "lucide-react";

interface CorrelationResult {
  symbols: string[];
  matrix: number[][];
}

function getCorrelationColor(value: number): string {
  if (value >= 0.7) return "bg-bullish/80";
  if (value >= 0.3) return "bg-bullish/60";
  if (value > -0.3) return "bg-bg-elevated";
  if (value > -0.7) return "bg-bearish/60";
  return "bg-bearish/80";
}

export default function RiskCorrelationPage() {
  const [source, setSource] = useState<"positions" | "watchlist">("watchlist");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [result, setResult] = useState<CorrelationResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      let syms: string[] = [];
      try {
        if (source === "positions") {
          const res = await fetch("/api/trader/dashboard");
          if (res.ok) {
            const data = await res.json();
            const positions = data.positions ?? [];
            syms = [...new Set(positions.map((p: { symbol: string }) => p.symbol))] as string[];
          }
        }
        if (syms.length < 2) {
          const res = await fetch("/api/watchlist");
          if (res.ok) {
            const data = await res.json();
            syms = data.symbols ?? [];
          }
        }
        if (syms.length < 2) syms = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"];
        setSymbols(syms.slice(0, 10));

        const corrRes = await fetch(`/api/correlation?symbols=${encodeURIComponent(syms.slice(0, 10).join(","))}`);
        if (corrRes.ok) setResult(await corrRes.json());
      } catch { /* handled */ }
      setLoading(false);
    }
    load();
  }, [source]);

  // Compute risk metrics
  let avgCorrelation = 0;
  let maxCorrelation = 0;
  let maxPair = "";
  const alerts: string[] = [];

  if (result && result.matrix.length >= 2) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < result.matrix.length; i++) {
      for (let j = i + 1; j < result.matrix[i].length; j++) {
        const val = result.matrix[i][j];
        sum += val;
        count++;
        if (val > maxCorrelation) {
          maxCorrelation = val;
          maxPair = `${result.symbols[i]}/${result.symbols[j]}`;
        }
        if (val > 0.7) {
          alerts.push(`${result.symbols[i]} / ${result.symbols[j]}: ${val.toFixed(2)} — high correlation`);
        }
      }
    }
    avgCorrelation = count > 0 ? sum / count : 0;
  }

  const diversificationScore = Math.round((1 - avgCorrelation) * 100);
  const riskLevel = avgCorrelation > 0.6 ? "high" : avgCorrelation > 0.3 ? "moderate" : "low";

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <SubNav tabs={SUB_NAV.analysis} />
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
        eyebrow="Risk Management"
        title="Correlation Risk"
        description="Monitor portfolio diversification and concentration risk across your positions."
        stats={[
          { label: "Diversification", value: `${diversificationScore}%`, tone: diversificationScore >= 60 ? "bullish" : "bearish" },
          { label: "Risk Level", value: riskLevel.toUpperCase(), tone: riskLevel === "low" ? "bullish" : riskLevel === "high" ? "bearish" : "neutral" },
          { label: "Correlated Pairs", value: String(alerts.length), tone: alerts.length > 0 ? "bearish" : "bullish" },
          { label: "Avg Correlation", value: avgCorrelation.toFixed(2) },
        ]}
      />

      <div className="flex gap-2">
        <Button variant={source === "positions" ? "primary" : "secondary"} size="sm" onClick={() => setSource("positions")}>
          Positions
        </Button>
        <Button variant={source === "watchlist" ? "primary" : "secondary"} size="sm" onClick={() => setSource("watchlist")}>
          Watchlist
        </Button>
      </div>

      {!result || symbols.length < 2 ? (
        <EmptyState
          icon={<ShieldAlert className="w-10 h-10" />}
          title="Not enough symbols"
          description="Add at least 2 symbols to your watchlist or open positions to analyze correlation risk."
        />
      ) : (
        <>
          {/* Risk summary */}
          <Card className={`border ${riskLevel === "high" ? "border-bearish/20 bg-bearish/5" : riskLevel === "moderate" ? "border-warning/20 bg-warning/5" : "border-bullish/20 bg-bullish/5"}`}>
            <div className="flex items-center gap-3">
              <ShieldAlert className={`w-5 h-5 ${riskLevel === "high" ? "text-bearish" : riskLevel === "moderate" ? "text-warning" : "text-bullish"}`} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary">Concentration Risk</span>
                  <Badge variant={riskLevel === "high" ? "bearish" : riskLevel === "moderate" ? "warning" : "bullish"}>
                    {riskLevel.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-sm text-text-secondary">
                  {riskLevel === "high" ? "Your portfolio is highly concentrated. A single sector move could impact most positions." :
                   riskLevel === "moderate" ? "Moderate concentration. Consider adding uncorrelated assets." :
                   "Good diversification across positions."}
                </p>
              </div>
            </div>
          </Card>

          {/* Correlation matrix */}
          <Card>
            <CardHeader className="p-0 pb-3">
              <CardTitle>Correlation Matrix</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr>
                    <th className="pr-3 pb-2 text-left text-text-muted font-medium" />
                    {result.symbols.map((s) => (
                      <th key={s} className="px-2 pb-2 text-center text-text-muted font-mono font-medium text-xs">{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.symbols.map((sym, i) => (
                    <tr key={sym}>
                      <td className="pr-3 py-1 font-mono text-xs font-medium text-text-secondary">{sym}</td>
                      {result.matrix[i].map((val, j) => (
                        <td key={j} className="px-0.5 py-0.5">
                          <div className={`${getCorrelationColor(val)} rounded px-2 py-1.5 text-center font-mono text-xs text-text-primary/90 min-w-[48px]`}>
                            {val.toFixed(2)}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Risk alerts */}
          {alerts.length > 0 && (
            <Card>
              <CardHeader className="p-0 pb-3">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  Risk Alerts
                </CardTitle>
              </CardHeader>
              <div className="space-y-2">
                {alerts.map((alert, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-warning/5 border border-warning/10">
                    <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
                    <span className="text-sm text-text-secondary font-mono">{alert}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
