"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "../ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface RecommendationData {
  period: string;
  buy: number;
  hold: number;
  sell: number;
  strongBuy: number;
  strongSell: number;
  consensus: string;
  totalAnalysts: number;
}

interface AnalystConsensusProps {
  symbol: string;
}

export function AnalystConsensus({ symbol }: AnalystConsensusProps) {
  const [data, setData] = useState<RecommendationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(false);

    fetch(`/api/recommendations/${encodeURIComponent(symbol)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((json) => {
        setData(json.recommendations ?? null);
      })
      .catch(() => {
        setError(true);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton width="60%" height="12px" rounded="sm" />
        <Skeleton width="100%" height="20px" rounded="full" />
        <Skeleton width="40%" height="12px" rounded="sm" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-xs text-text-muted">
        Analyst data unavailable
      </p>
    );
  }

  const buyTotal = data.strongBuy + data.buy;
  const sellTotal = data.strongSell + data.sell;
  const total = buyTotal + data.hold + sellTotal;

  if (total === 0) {
    return (
      <p className="text-xs text-text-muted">
        No analyst coverage
      </p>
    );
  }

  const buyPct = (buyTotal / total) * 100;
  const holdPct = (data.hold / total) * 100;
  const sellPct = (sellTotal / total) * 100;

  const ConsensusIcon =
    data.consensus.includes("Buy") ? TrendingUp :
    data.consensus.includes("Sell") ? TrendingDown :
    Minus;

  const consensusColor =
    data.consensus.includes("Buy") ? "text-bullish" :
    data.consensus.includes("Sell") ? "text-bearish" :
    "text-text-secondary";

  return (
    <div className="space-y-2">
      {/* Consensus label */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ConsensusIcon className={`w-3.5 h-3.5 ${consensusColor}`} />
          <span className={`text-xs font-semibold ${consensusColor}`}>
            {data.consensus}
          </span>
        </div>
        <span className="text-[10px] text-text-muted">
          {data.totalAnalysts} analyst{data.totalAnalysts !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Bar */}
      <div className="h-3 rounded-full overflow-hidden flex bg-bg-elevated">
        {buyPct > 0 && (
          <div
            className="h-full bg-bullish transition-all duration-500"
            style={{ width: `${buyPct}%` }}
            title={`Buy: ${buyTotal}`}
          />
        )}
        {holdPct > 0 && (
          <div
            className="h-full bg-text-muted/30 transition-all duration-500"
            style={{ width: `${holdPct}%` }}
            title={`Hold: ${data.hold}`}
          />
        )}
        {sellPct > 0 && (
          <div
            className="h-full bg-bearish transition-all duration-500"
            style={{ width: `${sellPct}%` }}
            title={`Sell: ${sellTotal}`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-bullish font-medium">
          {buyTotal} Buy
        </span>
        <span className="text-text-muted">
          {data.hold} Hold
        </span>
        <span className="text-bearish font-medium">
          {sellTotal} Sell
        </span>
      </div>
    </div>
  );
}
