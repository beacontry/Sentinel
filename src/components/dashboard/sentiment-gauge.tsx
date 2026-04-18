"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface SentimentData {
  bullishPercent: number;
  bearishPercent: number;
  newsScore: number;
  buzz: number;
  articlesInLastWeek: number;
  sectorAvgBullish: number;
  configured: boolean;
}

interface SentimentGaugeProps {
  symbol: string;
}

export function SentimentGauge({ symbol }: SentimentGaugeProps) {
  const [data, setData] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchSentiment() {
      setLoading(true);
      try {
        const res = await fetch(`/api/sentiment/${encodeURIComponent(symbol)}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.configured !== false) {
          setData(json);
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchSentiment();
  }, [symbol]);

  if (loading || !data) return null;

  const bullish = data.bullishPercent;
  const label = bullish >= 0.6 ? "Bullish" : bullish <= 0.4 ? "Bearish" : "Neutral";
  const color = bullish >= 0.6 ? "text-bullish" : bullish <= 0.4 ? "text-bearish" : "text-warning";
  const Icon = bullish >= 0.6 ? TrendingUp : bullish <= 0.4 ? TrendingDown : Minus;

  // SVG semicircular gauge
  const radius = 40;
  const cx = 50;
  const cy = 50;
  const startAngle = Math.PI; // left
  const endAngle = 0; // right
  const needleAngle = startAngle - bullish * Math.PI;

  const arcPath = describeArc(cx, cy, radius, startAngle, endAngle);
  const filledAngle = startAngle - bullish * (startAngle - endAngle);
  const filledPath = describeArc(cx, cy, radius, startAngle, filledAngle);

  const needleX = cx + radius * 0.75 * Math.cos(needleAngle);
  const needleY = cy - radius * 0.75 * Math.sin(needleAngle);

  const vsSector = bullish - data.sectorAvgBullish;
  const vsSectorLabel =
    vsSector > 0.05
      ? "Above sector avg"
      : vsSector < -0.05
        ? "Below sector avg"
        : "At sector avg";

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-bg-elevated border border-border">
      {/* Gauge */}
      <div className="shrink-0">
        <svg width="100" height="60" viewBox="0 0 100 60">
          {/* Background arc */}
          <path d={arcPath} fill="none" stroke="#1e293b" strokeWidth="6" strokeLinecap="round" />
          {/* Filled arc */}
          <path
            d={filledPath}
            fill="none"
            stroke={bullish >= 0.6 ? "#22c55e" : bullish <= 0.4 ? "#ef4444" : "#f59e0b"}
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* Needle */}
          <line
            x1={cx}
            y1={cy}
            x2={needleX}
            y2={needleY}
            stroke="#f8fafc"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx={cx} cy={cy} r="3" fill="#f8fafc" />
          {/* Labels */}
          <text x="8" y="55" fill="#64748b" fontSize="7" fontFamily="IBM Plex Sans">Bear</text>
          <text x="78" y="55" fill="#64748b" fontSize="7" fontFamily="IBM Plex Sans">Bull</text>
        </svg>
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <Icon className={`w-3.5 h-3.5 ${color}`} />
          <span className={`text-sm font-medium ${color}`}>{label}</span>
          <span className="text-xs text-text-muted ml-auto">
            {Math.round(bullish * 100)}% bullish
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span>{data.articlesInLastWeek} articles</span>
          <span>{vsSectorLabel}</span>
        </div>
      </div>
    </div>
  );
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy - r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy - r * Math.sin(endAngle);
  const largeArc = Math.abs(startAngle - endAngle) > Math.PI ? 1 : 0;
  // Sweep direction: clockwise in screen coords (y inverted)
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2}`;
}
