"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageIntro } from "@/components/layout/page-intro";
import { GitCompareArrows } from "lucide-react";
import { PaywallBanner } from "@/components/tiers/paywall-banner";

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

export default function CorrelationPage() {
  const [symbols, setSymbols] = useState("AAPL,MSFT,GOOGL,AMZN,NVDA");
  const [result, setResult] = useState<CorrelationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCompute() {
    if (!symbols.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/correlation?symbols=${encodeURIComponent(symbols)}`
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to compute");
        return;
      }
      setResult(await res.json());
    } catch {
      setError("Failed to compute correlation");
    } finally {
      setLoading(false);
    }
  }

  // Auto-compute on mount
  useEffect(() => {
    handleCompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PaywallBanner minTier="trader" featureName="Correlation Matrix" />
      <PageIntro
        eyebrow="Market Analysis"
        title="Correlation"
        description="Explore price correlation between symbols over 90-day daily returns."
        stats={[
          { label: "Symbols", value: result ? String(result.symbols.length) : "--" },
          {
            label: "Strongest Pair",
            value: result && result.symbols.length >= 2
              ? (() => {
                  let maxVal = -2, maxI = 0, maxJ = 1;
                  for (let i = 0; i < result.matrix.length; i++)
                    for (let j = i + 1; j < result.matrix[i].length; j++)
                      if (result.matrix[i][j] > maxVal) { maxVal = result.matrix[i][j]; maxI = i; maxJ = j; }
                  return `${result.symbols[maxI]}/${result.symbols[maxJ]}`;
                })()
              : "--",
            tone: "bullish",
          },
          {
            label: "Highest Corr",
            value: result && result.symbols.length >= 2
              ? (() => {
                  let maxVal = -2;
                  for (let i = 0; i < result.matrix.length; i++)
                    for (let j = i + 1; j < result.matrix[i].length; j++)
                      if (result.matrix[i][j] > maxVal) maxVal = result.matrix[i][j];
                  return maxVal.toFixed(2);
                })()
              : "--",
            tone: "brand",
          },
          { label: "Period", value: "90 days" },
        ]}
      />

      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              label="Symbols (comma-separated, max 10)"
              value={symbols}
              onChange={(e) => setSymbols(e.target.value.toUpperCase())}
              placeholder="AAPL,MSFT,GOOGL"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleCompute} loading={loading}>
              <GitCompareArrows className="w-4 h-4" />
              Compute
            </Button>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-bearish">{error}</p>}
      </Card>

      {result && (
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
                    <th
                      key={s}
                      className="px-2 pb-2 text-center text-text-muted font-mono font-medium text-xs"
                    >
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.symbols.map((sym, i) => (
                  <tr key={sym}>
                    <td className="pr-3 py-1 font-mono text-xs font-medium text-text-secondary">
                      {sym}
                    </td>
                    {result.matrix[i].map((val, j) => (
                      <td key={j} className="px-0.5 py-0.5">
                        <div
                          className={`${getCorrelationColor(val)} rounded px-2 py-1.5 text-center
                            font-mono text-xs text-text-primary/90 min-w-[48px]`}
                          title={`${result.symbols[i]} vs ${result.symbols[j]}: ${val.toFixed(3)}`}
                        >
                          {val.toFixed(2)}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-4 text-[10px] text-text-muted">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-bullish/80" />
              Strong positive (&gt;0.7)
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-bg-elevated" />
              Weak/none
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-bearish/80" />
              Strong negative (&lt;-0.7)
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
