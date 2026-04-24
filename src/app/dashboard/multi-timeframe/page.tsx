"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SignalBadge } from "@/components/ui/signal-badge";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { Layers, Search } from "lucide-react";

interface TimeframeData {
  label: string;
  signal: string;
  confidence: number;
  price: number;
  rsi: number | null;
  macd_histogram: number | null;
  ema_9: number | null;
  ema_21: number | null;
  available: boolean;
}

interface ConfluenceData {
  status: "confirmed" | "divergent" | "mixed";
  score: number;
  description: string;
}

interface MultiTFResult {
  symbol: string;
  timeframes: TimeframeData[];
  confluence: ConfluenceData;
}

const confluenceColor: Record<string, string> = {
  confirmed: "text-bullish",
  divergent: "text-bearish",
  mixed: "text-warning",
};

const confluenceBg: Record<string, string> = {
  confirmed: "bg-bullish/10 border-bullish/20",
  divergent: "bg-bearish/10 border-bearish/20",
  mixed: "bg-warning/10 border-warning/20",
};

export default function MultiTimeframePage() {
  const [symbol, setSymbol] = useState("AAPL");
  const [result, setResult] = useState<MultiTFResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    if (!symbol.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/multi-timeframe?symbol=${encodeURIComponent(symbol.toUpperCase())}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Analysis failed");
        return;
      }
      setResult(await res.json());
    } catch {
      setError("Failed to analyze");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { analyze(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.analysis} />
      <PageIntro
        eyebrow="Market Analysis"
        title="Multi-Timeframe"
        description="Compare signal confluence across intraday and daily timeframes for higher-conviction entries."
        stats={[
          { label: "Symbol", value: result?.symbol ?? "--" },
          {
            label: "Confluence",
            value: result ? result.confluence.status.toUpperCase() : "--",
            tone: result?.confluence.status === "confirmed" ? "bullish" : result?.confluence.status === "divergent" ? "bearish" : "neutral",
          },
          { label: "Score", value: result ? `${result.confluence.score}` : "--", tone: "brand" },
          { label: "Timeframes", value: "2" },
        ]}
      />

      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              label="Symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={analyze} loading={loading}>
              <Search className="w-4 h-4" />
              Analyze
            </Button>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-bearish">{error}</p>}
      </Card>

      {result && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {result.timeframes.map((tf) => (
              <Card key={tf.label}>
                <CardHeader className="p-0 pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-text-muted" />
                      {tf.label}
                    </CardTitle>
                    {tf.available && <SignalBadge signal={tf.signal as "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL"} />}
                  </div>
                </CardHeader>
                {!tf.available ? (
                  <p className="text-sm text-text-muted">Not enough data for this timeframe.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-baseline gap-3">
                      <span className="text-2xl font-mono font-semibold">${tf.price.toFixed(2)}</span>
                      <span className="text-sm text-text-muted">
                        {Math.round(tf.confidence * 100)}% confidence
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-text-muted text-left">
                            <th className="pb-2 pr-4 font-medium">Indicator</th>
                            <th className="pb-2 font-medium text-right">Value</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono">
                          <tr className="border-b border-border/50">
                            <td className="py-2 pr-4 text-text-secondary">RSI (14)</td>
                            <td className={`py-2 text-right ${tf.rsi !== null ? (tf.rsi > 70 ? "text-bearish" : tf.rsi < 30 ? "text-bullish" : "text-text-primary") : "text-text-muted"}`}>
                              {tf.rsi !== null ? tf.rsi.toFixed(1) : "--"}
                            </td>
                          </tr>
                          <tr className="border-b border-border/50">
                            <td className="py-2 pr-4 text-text-secondary">MACD Histogram</td>
                            <td className={`py-2 text-right ${tf.macd_histogram !== null ? (tf.macd_histogram > 0 ? "text-bullish" : "text-bearish") : "text-text-muted"}`}>
                              {tf.macd_histogram !== null ? tf.macd_histogram.toFixed(3) : "--"}
                            </td>
                          </tr>
                          <tr className="border-b border-border/50">
                            <td className="py-2 pr-4 text-text-secondary">EMA 9</td>
                            <td className="py-2 text-right text-text-primary">
                              {tf.ema_9 !== null ? tf.ema_9.toFixed(2) : "--"}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 pr-4 text-text-secondary">EMA 21</td>
                            <td className="py-2 text-right text-text-primary">
                              {tf.ema_21 !== null ? tf.ema_21.toFixed(2) : "--"}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>

          <Card className={`border ${confluenceBg[result.confluence.status]}`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-text-primary">Confluence Assessment</h3>
                  <Badge variant={result.confluence.status === "confirmed" ? "bullish" : result.confluence.status === "divergent" ? "bearish" : "warning"}>
                    {result.confluence.status.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-sm text-text-secondary">{result.confluence.description}</p>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">Score</div>
                <div className={`text-3xl font-mono font-semibold ${confluenceColor[result.confluence.status]}`}>
                  {result.confluence.score}
                </div>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
