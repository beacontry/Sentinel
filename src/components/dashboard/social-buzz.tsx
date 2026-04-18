"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "../ui/skeleton";
import { TrendingUp, TrendingDown, Minus, MessageCircle } from "lucide-react";

interface SocialData {
  reddit: { mentions: number; positiveScore: number; negativeScore: number };
  twitter: { mentions: number; positiveScore: number; negativeScore: number };
  totalMentions: number;
  avgScore: number;
  trend: "up" | "down" | "flat";
}

interface SocialBuzzProps {
  symbol: string;
}

export function SocialBuzz({ symbol }: SocialBuzzProps) {
  const [data, setData] = useState<SocialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(false);

    fetch(`/api/social-sentiment/${encodeURIComponent(symbol)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((json) => {
        if (json.configured === false) {
          setData(null);
        } else {
          setData(json);
        }
      })
      .catch(() => {
        setError(true);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) {
    return (
      <div className="flex gap-3">
        <Skeleton width="33%" height="36px" rounded="md" />
        <Skeleton width="33%" height="36px" rounded="md" />
        <Skeleton width="33%" height="36px" rounded="md" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-xs text-text-muted">
        Social data unavailable
      </p>
    );
  }

  const sentimentColor =
    data.avgScore > 0.6 ? "text-bullish" :
    data.avgScore < 0.4 ? "text-bearish" :
    "text-text-secondary";

  const sentimentBg =
    data.avgScore > 0.6 ? "bg-bullish/10" :
    data.avgScore < 0.4 ? "bg-bearish/10" :
    "bg-bg-elevated";

  const TrendIcon =
    data.trend === "up" ? TrendingUp :
    data.trend === "down" ? TrendingDown :
    Minus;

  const trendColor =
    data.trend === "up" ? "text-bullish" :
    data.trend === "down" ? "text-bearish" :
    "text-text-muted";

  return (
    <div className="flex items-stretch gap-2">
      {/* Total mentions */}
      <div className="flex-1 rounded-lg bg-bg-elevated px-2.5 py-2 text-center">
        <div className="flex items-center justify-center gap-1 mb-0.5">
          <MessageCircle className="w-3 h-3 text-text-muted" />
          <span className="text-[10px] text-text-muted uppercase tracking-wider">
            Mentions
          </span>
        </div>
        <span className="font-mono text-sm font-medium text-text-primary">
          {data.totalMentions.toLocaleString()}
        </span>
      </div>

      {/* Sentiment score */}
      <div className={`flex-1 rounded-lg px-2.5 py-2 text-center ${sentimentBg}`}>
        <span className="text-[10px] text-text-muted uppercase tracking-wider block mb-0.5">
          Sentiment
        </span>
        <span className={`font-mono text-sm font-bold ${sentimentColor}`}>
          {(data.avgScore * 100).toFixed(0)}%
        </span>
      </div>

      {/* Trend */}
      <div className="flex-1 rounded-lg bg-bg-elevated px-2.5 py-2 text-center">
        <span className="text-[10px] text-text-muted uppercase tracking-wider block mb-0.5">
          Trend
        </span>
        <div className="flex items-center justify-center gap-1">
          <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />
          <span className={`text-xs font-medium capitalize ${trendColor}`}>
            {data.trend}
          </span>
        </div>
      </div>
    </div>
  );
}
