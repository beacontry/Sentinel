"use client";

import type { AnalysisResult } from "@/types";
import { Card } from "../ui/card";
import { SignalBadge } from "../ui/signal-badge";
import { PriceChart, type ChartEvent } from "./price-chart";
import { SentimentGauge } from "./sentiment-gauge";
import { TimeframeComparison } from "./timeframe-comparison";
import { AccuracyBadge } from "./accuracy-badge";
import { TrendingUp, TrendingDown, Activity, Share2, BarChart3 } from "lucide-react";
import { Button } from "../ui/button";
import { useState, useEffect } from "react";

interface SignalCardProps {
  analysis: AnalysisResult;
  onShare?: (analysis: AnalysisResult, comment: string) => void;
}

export function SignalCard({ analysis, onShare }: SignalCardProps) {
  const [showChart, setShowChart] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [shareComment, setShareComment] = useState("");
  const [showShare, setShowShare] = useState(false);
  const [chartEvents, setChartEvents] = useState<ChartEvent[]>([]);

  // Fetch earnings dates for chart markers
  useEffect(() => {
    async function fetchEarnings() {
      try {
        const res = await fetch(`/api/earnings?symbols=${encodeURIComponent(analysis.symbol)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.earnings?.length > 0) {
          setChartEvents(
            data.earnings.map((e: { date: string; hour: string }) => ({
              date: e.date + "T" + (e.hour === "bmo" ? "09:30:00" : "16:00:00"),
              type: "earnings" as const,
              label: `Earnings ${e.hour === "bmo" ? "(Pre)" : e.hour === "amc" ? "(Post)" : ""}`,
            }))
          );
        }
      } catch {
        // Non-critical -- skip earnings markers
      }
    }
    fetchEarnings();
  }, [analysis.symbol]);

  const priceChange =
    analysis.indicators.sma_20 !== null
      ? ((analysis.price - analysis.indicators.sma_20) /
          analysis.indicators.sma_20) *
        100
      : null;

  const isBullish =
    analysis.signal === "BUY" || analysis.signal === "STRONG_BUY";
  const isBearish =
    analysis.signal === "SELL" || analysis.signal === "STRONG_SELL";

  const TrendIcon = isBullish
    ? TrendingUp
    : isBearish
      ? TrendingDown
      : Activity;

  return (
    <Card hover className="animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center
              ${isBullish ? "bg-bullish/20" : isBearish ? "bg-bearish/20" : "bg-neutral/20"}`}
          >
            <TrendIcon
              className={`w-5 h-5 ${isBullish ? "text-bullish" : isBearish ? "text-bearish" : "text-neutral"}`}
            />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold">{analysis.symbol}</h3>
            <p className="font-mono text-sm text-text-secondary">
              ${analysis.price.toFixed(2)}
              {priceChange !== null && (
                <span
                  className={`ml-2 ${priceChange >= 0 ? "text-bullish" : "text-bearish"}`}
                >
                  {priceChange >= 0 ? "+" : ""}
                  {priceChange.toFixed(2)}%
                </span>
              )}
            </p>
          </div>
        </div>
        <SignalBadge signal={analysis.signal} size="lg" />
      </div>

      {/* Plain English + Accuracy */}
      <p className="text-sm text-text-secondary leading-relaxed mb-2">
        {analysis.plainEnglish}
      </p>
      <div className="mb-3">
        <AccuracyBadge symbol={analysis.symbol} />
      </div>

      {/* Confidence bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-text-muted mb-1">
          <span>Confidence</span>
          <span>{Math.round(analysis.confidence * 100)}%</span>
        </div>
        <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500
              ${isBullish ? "bg-bullish" : isBearish ? "bg-bearish" : "bg-neutral"}`}
            style={{ width: `${analysis.confidence * 100}%` }}
          />
        </div>
      </div>

      {/* Sentiment + Multi-timeframe */}
      <div className="mb-3 space-y-3">
        <SentimentGauge symbol={analysis.symbol} />
        <TimeframeComparison
          symbol={analysis.symbol}
          intradaySignal={analysis.signal}
        />
      </div>

      {/* Chart */}
      {showChart && analysis.bars?.length > 0 && (
        <div className="mb-3">
          <PriceChart analysis={analysis} events={chartEvents} />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant={showChart ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setShowChart(!showChart)}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Chart
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? "Hide" : "Details"}
        </Button>
        {onShare && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowShare(!showShare)}
          >
            <Share2 className="w-3.5 h-3.5" />
            Share
          </Button>
        )}
      </div>

      {/* Details panel */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "VWAP", value: analysis.indicators.vwap },
            { label: "SMA 9", value: analysis.indicators.sma_9 },
            { label: "SMA 20", value: analysis.indicators.sma_20 },
            { label: "SMA 50", value: analysis.indicators.sma_50 },
            { label: "EMA 9", value: analysis.indicators.ema_9 },
            { label: "EMA 21", value: analysis.indicators.ema_21 },
            { label: "RSI", value: analysis.indicators.rsi_14 },
            { label: "MACD", value: analysis.indicators.macd_line },
            { label: "MACD Sig", value: analysis.indicators.macd_signal },
          ].map(
            ({ label, value }) =>
              value !== null && (
                <div key={label}>
                  <p className="text-xs text-text-muted">{label}</p>
                  <p className="font-mono text-sm">
                    {label === "RSI"
                      ? value.toFixed(1)
                      : label.startsWith("MACD")
                        ? value.toFixed(4)
                        : `$${value.toFixed(2)}`}
                  </p>
                </div>
              )
          )}
          <div className="col-span-full mt-2">
            <p className="text-xs text-text-muted mb-1">Reasons</p>
            <ul className="space-y-1">
              {analysis.reasons.map((r, i) => (
                <li key={i} className="text-xs text-text-secondary flex gap-1.5">
                  <span className="text-accent mt-0.5">*</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Share panel */}
      {showShare && onShare && (
        <div className="mt-3 pt-3 border-t border-border space-y-2">
          <textarea
            value={shareComment}
            onChange={(e) => setShareComment(e.target.value)}
            placeholder="Add a comment (optional)..."
            maxLength={500}
            className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm
              text-text-primary placeholder:text-text-muted resize-none h-20
              focus:outline-none focus:border-accent"
          />
          <Button
            size="sm"
            onClick={() => {
              onShare(analysis, shareComment);
              setShareComment("");
              setShowShare(false);
            }}
          >
            Post to Feed
          </Button>
        </div>
      )}
    </Card>
  );
}
