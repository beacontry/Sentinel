"use client";

import { useState, useEffect } from "react";
import type { AnalysisResult } from "@/types";
import { SignalBadge } from "../ui/signal-badge";
import { Badge } from "../ui/badge";
import { Clock, CheckCircle, AlertTriangle } from "lucide-react";

interface TimeframeComparisonProps {
  symbol: string;
  intradaySignal: AnalysisResult["signal"];
}

export function TimeframeComparison({ symbol, intradaySignal }: TimeframeComparisonProps) {
  const [dailySignal, setDailySignal] = useState<AnalysisResult["signal"] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchDaily() {
      setLoading(true);
      try {
        const res = await fetch(`/api/analyze/${encodeURIComponent(symbol)}/daily`);
        if (!res.ok) return;
        const data = await res.json();
        setDailySignal(data.signal);
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchDaily();
  }, [symbol]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-bg-elevated text-xs text-text-muted">
        <Clock className="w-3.5 h-3.5 animate-pulse" />
        Loading daily timeframe...
      </div>
    );
  }

  if (!dailySignal) return null;

  const intradayBullish = intradaySignal === "BUY" || intradaySignal === "STRONG_BUY";
  const intradayBearish = intradaySignal === "SELL" || intradaySignal === "STRONG_SELL";
  const dailyBullish = dailySignal === "BUY" || dailySignal === "STRONG_BUY";
  const dailyBearish = dailySignal === "SELL" || dailySignal === "STRONG_SELL";

  const confirmed =
    (intradayBullish && dailyBullish) ||
    (intradayBearish && dailyBearish) ||
    (intradaySignal === "HOLD" && dailySignal === "HOLD");

  const divergent =
    (intradayBullish && dailyBearish) ||
    (intradayBearish && dailyBullish);

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-elevated border border-border">
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted font-mono">5min</span>
        <SignalBadge signal={intradaySignal} size="sm" />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted font-mono">Daily</span>
        <SignalBadge signal={dailySignal} size="sm" />
      </div>
      <div className="ml-auto">
        {confirmed ? (
          <Badge variant="bullish">
            <CheckCircle className="w-3 h-3 mr-1" />
            Confirmed
          </Badge>
        ) : divergent ? (
          <Badge variant="warning">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Divergent
          </Badge>
        ) : (
          <Badge variant="neutral">Mixed</Badge>
        )}
      </div>
    </div>
  );
}
