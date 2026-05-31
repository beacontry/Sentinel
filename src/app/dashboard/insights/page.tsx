"use client";

import { useState, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Zap,
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { PageIntro } from "@/components/layout/page-intro";
import { PaywallBanner } from "@/components/tiers/paywall-banner";

interface InsightResult {
  symbol: string;
  insight: string;
  factors: string[];
  sentiment: "bullish" | "bearish" | "neutral";
  queriedAt: string;
}

const SENTIMENT_CONFIG = {
  bullish: { icon: TrendingUp, color: "text-bullish", bg: "bg-bullish/10", label: "Bullish", variant: "bullish" as const },
  bearish: { icon: TrendingDown, color: "text-bearish", bg: "bg-bearish/10", label: "Bearish", variant: "bearish" as const },
  neutral: { icon: Minus, color: "text-text-secondary", bg: "bg-neutral/10", label: "Neutral", variant: "neutral" as const },
};

export default function InsightsPage() {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<InsightResult | null>(null);
  const [history, setHistory] = useState<InsightResult[]>([]);

  const fetchInsight = useCallback(async () => {
    const trimmed = symbol.trim().toUpperCase();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/insights/${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to fetch insight");
        return;
      }

      const data = await res.json();
      const result: InsightResult = {
        symbol: data.symbol,
        insight: data.insight,
        factors: data.factors,
        sentiment: data.sentiment,
        queriedAt: new Date().toISOString(),
      };

      setCurrent(result);
      setHistory((prev) => {
        const filtered = prev.filter((h) => h.symbol !== result.symbol);
        return [result, ...filtered].slice(0, 5);
      });
    } catch {
      setError("Failed to fetch insight");
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      fetchInsight();
    }
  }

  function loadFromHistory(item: InsightResult) {
    setCurrent(item);
    setSymbol(item.symbol);
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PaywallBanner minTier="premium" featureName="AI Insights" description="AI-generated Quick Insight per symbol, summarizing technical + sentiment + fundamentals." />
      <PageIntro
        eyebrow="Research"
        title="Insights"
        description="Get AI-powered summaries explaining why a stock is moving and the key factors driving it."
        stats={[
          { label: "Queries", value: String(history.length) },
          { label: "Bullish", value: String(history.filter((h) => h.sentiment === "bullish").length), tone: "bullish" },
          { label: "Bearish", value: String(history.filter((h) => h.sentiment === "bearish").length), tone: "bearish" },
          { label: "Current", value: current?.symbol ?? "--" },
        ]}
      />

      {/* Search */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              icon={<Search className="w-4 h-4" />}
              placeholder="Enter symbol (e.g. AAPL, TSLA, MSFT)"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={fetchInsight}
              loading={loading}
              disabled={!symbol.trim()}
            >
              <Zap className="w-4 h-4" />
              Get Insight
            </Button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-bearish">{error}</p>}
      </Card>

      {/* Loading State */}
      {loading && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton width="80px" height="28px" rounded="full" />
              <Skeleton width="120px" height="20px" />
            </div>
            <Skeleton width="100%" height="16px" />
            <Skeleton width="90%" height="16px" />
            <Skeleton width="70%" height="16px" />
            <div className="flex gap-2 pt-2">
              <Skeleton width="100px" height="24px" rounded="full" />
              <Skeleton width="120px" height="24px" rounded="full" />
              <Skeleton width="90px" height="24px" rounded="full" />
            </div>
          </div>
        </Card>
      )}

      {/* Result */}
      {current && !loading && (
        <InsightCard insight={current} />
      )}

      {/* Empty State */}
      {!current && !loading && (
        <EmptyState
          icon={<Zap className="h-12 w-12" />}
          title="Get AI market insights"
          description="Enter a stock symbol above to get an AI-powered explanation of why it is moving today."
        />
      )}

      {/* History */}
      {history.length > 1 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
            Recent Insights
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {history
              .filter((h) => h.symbol !== current?.symbol)
              .map((item) => (
                <Card
                  key={`${item.symbol}-${item.queriedAt}`}
                  hover
                  className="cursor-pointer"
                  onClick={() => loadFromHistory(item)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-display font-bold text-text-primary">
                      {item.symbol}
                    </span>
                    <Badge variant={SENTIMENT_CONFIG[item.sentiment].variant}>
                      {SENTIMENT_CONFIG[item.sentiment].label}
                    </Badge>
                  </div>
                  <p className="text-xs text-text-secondary line-clamp-2">
                    {item.insight}
                  </p>
                  <p className="text-xs text-text-muted mt-2">
                    {new Date(item.queriedAt).toLocaleTimeString()}
                  </p>
                </Card>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InsightCard({ insight }: { insight: InsightResult }) {
  const sentimentConfig = SENTIMENT_CONFIG[insight.sentiment];
  const SentimentIcon = sentimentConfig.icon;

  return (
    <Card>
      {/* Header */}
      <CardHeader>
        <div className="flex items-center gap-3">
          <h2 className="font-display text-xl font-bold text-text-primary">
            {insight.symbol}
          </h2>
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${sentimentConfig.bg}`}
          >
            <SentimentIcon className={`w-4 h-4 ${sentimentConfig.color}`} />
            <span className={`text-sm font-medium ${sentimentConfig.color}`}>
              {sentimentConfig.label}
            </span>
          </div>
        </div>
        <span className="text-xs text-text-muted">
          {new Date(insight.queriedAt).toLocaleString()}
        </span>
      </CardHeader>

      {/* Insight Text */}
      <p className="text-sm text-text-secondary leading-relaxed mb-4">
        {insight.insight}
      </p>

      {/* Factors */}
      {insight.factors.length > 0 && (
        <div className="space-y-2">
          <CardTitle>Key Factors</CardTitle>
          <div className="flex flex-wrap gap-2">
            {insight.factors.map((factor, i) => (
              <Badge key={i} variant="neutral">
                {factor}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
