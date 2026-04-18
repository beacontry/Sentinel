"use client";

import { useState, useEffect } from "react";
import { Target } from "lucide-react";

interface AccuracyBadgeProps {
  symbol: string;
}

export function AccuracyBadge({ symbol }: AccuracyBadgeProps) {
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    async function fetchAccuracy() {
      try {
        const res = await fetch(`/api/accuracy/${encodeURIComponent(symbol)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.totalSignals > 0) {
          setAccuracy(data.accuracy);
          setTotal(data.totalSignals);
        }
      } catch {
        // Non-critical
      }
    }
    fetchAccuracy();
  }, [symbol]);

  if (accuracy === null || total === 0) return null;

  const pct = Math.round(accuracy * 100);
  const color =
    pct >= 60 ? "text-bullish" : pct >= 40 ? "text-warning" : "text-bearish";

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Target className={`w-3.5 h-3.5 ${color}`} />
      <span className={color}>{pct}% accuracy</span>
      <span className="text-text-muted">({total} signals)</span>
    </div>
  );
}
