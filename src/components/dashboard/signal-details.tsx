"use client";

import { useState } from "react";
import type { AnalysisResult } from "@/types";
import { SignalBadge } from "../ui/signal-badge";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import {
  Target,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  BarChart3,
  Crosshair,
  Zap,
  ArrowUpDown,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Globe,
} from "lucide-react";
import { AnalystConsensus } from "./analyst-consensus";
import { InsiderActivity } from "./insider-activity";
import { SocialBuzz } from "./social-buzz";
import { PeerStocks } from "./peer-stocks";
import { WhatIfSlider } from "./what-if-slider";

interface SignalDetailsProps {
  analysis: AnalysisResult | null;
  loading: boolean;
}

function getRsiStatus(rsi: number | null): {
  label: string;
  color: string;
} {
  if (rsi === null) return { label: "--", color: "text-text-muted" };
  if (rsi >= 70) return { label: "Overbought", color: "text-bearish" };
  if (rsi <= 30) return { label: "Oversold", color: "text-bullish" };
  return { label: "Neutral", color: "text-text-secondary" };
}

function getMacdDirection(
  macdLine: number | null,
  macdSignal: number | null
): { label: string; color: string } {
  if (macdLine === null || macdSignal === null)
    return { label: "--", color: "text-text-muted" };
  if (macdLine > macdSignal)
    return { label: "Bullish", color: "text-bullish" };
  return { label: "Bearish", color: "text-bearish" };
}

function getEmaTrend(
  ema9: number | null,
  ema21: number | null
): { label: string; color: string } {
  if (ema9 === null || ema21 === null)
    return { label: "--", color: "text-text-muted" };
  if (ema9 > ema21) return { label: "Uptrend", color: "text-bullish" };
  return { label: "Downtrend", color: "text-bearish" };
}

export function SignalDetails({ analysis, loading }: SignalDetailsProps) {
  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <Skeleton width="100%" height="24px" rounded="md" />
          <Skeleton width="60%" height="16px" rounded="sm" />
        </div>
        <Skeleton width="100%" height="8px" rounded="full" />
        <div className="space-y-2">
          <Skeleton width="80%" height="12px" rounded="sm" />
          <Skeleton width="90%" height="12px" rounded="sm" />
          <Skeleton width="70%" height="12px" rounded="sm" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} width="100%" height="48px" rounded="md" />
          ))}
        </div>
        <div className="space-y-2">
          <Skeleton width="100%" height="40px" rounded="md" />
          <Skeleton width="100%" height="40px" rounded="md" />
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
        <Crosshair className="w-10 h-10 text-text-muted mb-3" />
        <p className="text-sm font-medium text-text-secondary">
          Select a signal
        </p>
        <p className="text-xs text-text-muted mt-1">
          Click a signal in the feed to view analysis details
        </p>
      </div>
    );
  }

  const isBullish =
    analysis.signal === "BUY" || analysis.signal === "STRONG_BUY";
  const isBearish =
    analysis.signal === "SELL" || analysis.signal === "STRONG_SELL";
  const confidencePct = Math.round(analysis.confidence * 100);
  const stopLoss = analysis.price * 0.98;
  const takeProfit = analysis.price * 1.03;
  const riskPerShare = analysis.price - stopLoss;
  const rewardPerShare = takeProfit - analysis.price;
  const riskReward =
    riskPerShare > 0 ? (rewardPerShare / riskPerShare).toFixed(1) : "--";

  const priceChange =
    analysis.indicators.sma_20 !== null
      ? ((analysis.price - analysis.indicators.sma_20) /
          analysis.indicators.sma_20) *
        100
      : null;

  const rsiStatus = getRsiStatus(analysis.indicators.rsi_14);
  const macdDir = getMacdDirection(
    analysis.indicators.macd_line,
    analysis.indicators.macd_signal
  );
  const emaTrend = getEmaTrend(
    analysis.indicators.ema_9,
    analysis.indicators.ema_21
  );

  return (
    <div className="h-full overflow-y-auto">
      {/* Header: Symbol + Signal + Confidence */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-lg font-bold">{analysis.symbol}</h2>
          <SignalBadge signal={analysis.signal} size="lg" />
        </div>

        {/* Confidence bar */}
        <div className="mt-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-text-muted uppercase tracking-wider">
              Confidence
            </span>
            <span
              className={`font-mono font-bold ${
                confidencePct >= 70
                  ? "text-bullish"
                  : confidencePct >= 40
                    ? "text-warning"
                    : "text-bearish"
              }`}
            >
              {confidencePct}%
            </span>
          </div>
          <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                isBullish
                  ? "bg-bullish"
                  : isBearish
                    ? "bg-bearish"
                    : "bg-neutral"
              }`}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Price */}
      <div className="px-4 py-3 border-b border-border">
        <p className="text-xs text-text-muted uppercase tracking-wider mb-1">
          Price
        </p>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-lg font-bold">
            ${analysis.price.toFixed(2)}
          </span>
          {priceChange !== null && (
            <span
              className={`font-mono text-sm ${
                priceChange >= 0 ? "text-bullish" : "text-bearish"
              }`}
            >
              {priceChange >= 0 ? "+" : ""}
              {priceChange.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {/* Signal DNA - reasons */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-3.5 h-3.5 text-accent" />
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Signal DNA
          </p>
        </div>
        <ul className="space-y-1.5">
          {analysis.reasons.map((reason, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-xs text-text-secondary leading-relaxed"
            >
              <span className="text-accent mt-0.5 shrink-0">*</span>
              {reason}
            </li>
          ))}
        </ul>
        {analysis.plainEnglish && (
          <p className="text-xs text-text-muted mt-2 italic leading-relaxed">
            {analysis.plainEnglish}
          </p>
        )}
      </div>

      {/* Indicators snapshot */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="w-3.5 h-3.5 text-accent" />
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Indicators
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {/* RSI */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg-elevated">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-xs text-text-secondary">RSI (14)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium">
                {analysis.indicators.rsi_14?.toFixed(1) ?? "--"}
              </span>
              <span className={`text-[10px] font-medium ${rsiStatus.color}`}>
                {rsiStatus.label}
              </span>
            </div>
          </div>

          {/* MACD */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg-elevated">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-xs text-text-secondary">MACD</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium">
                {analysis.indicators.macd_line?.toFixed(3) ?? "--"}
              </span>
              <span className={`text-[10px] font-medium ${macdDir.color}`}>
                {macdDir.label}
              </span>
            </div>
          </div>

          {/* EMA Trend */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg-elevated">
            <div className="flex items-center gap-2">
              {emaTrend.label === "Uptrend" ? (
                <TrendingUp className="w-3.5 h-3.5 text-text-muted" />
              ) : emaTrend.label === "Downtrend" ? (
                <TrendingDown className="w-3.5 h-3.5 text-text-muted" />
              ) : (
                <Minus className="w-3.5 h-3.5 text-text-muted" />
              )}
              <span className="text-xs text-text-secondary">EMA 9/21</span>
            </div>
            <span className={`text-[10px] font-medium ${emaTrend.color}`}>
              {emaTrend.label}
            </span>
          </div>
        </div>
      </div>

      {/* Risk Management */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert className="w-3.5 h-3.5 text-accent" />
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Risk
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Stop Loss (2%)</span>
            <span className="font-mono text-sm text-bearish">
              ${stopLoss.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Take Profit (3%)</span>
            <span className="font-mono text-sm text-bullish">
              ${takeProfit.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-xs text-text-muted">Risk / Reward</span>
            <span className="font-mono text-sm font-medium text-text-primary">
              1 : {riskReward}
            </span>
          </div>
        </div>
      </div>

      {/* Hybrid layers (sentiment, options flow, AI) */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Hybrid Layers
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {analysis.unusualVolume && (
            <Badge variant="warning" className="text-[10px]">
              Unusual Volume{" "}
              {analysis.volumeRatio
                ? `${analysis.volumeRatio.toFixed(1)}x`
                : ""}
            </Badge>
          )}
          {analysis.fibonacci && (
            <Badge variant="default" className="text-[10px]">
              Fib Levels Active
            </Badge>
          )}
          <Badge variant="neutral" className="text-[10px]">
            Sentiment: --
          </Badge>
          <Badge variant="neutral" className="text-[10px]">
            Options Flow: --
          </Badge>
        </div>
      </div>

      {/* What-If Simulation */}
      <div className="px-4 py-3 border-b border-border">
        <WhatIfSlider analysis={analysis} />
      </div>

      {/* Action buttons */}
      <div className="px-4 py-3 border-b border-border space-y-2">
        <Button
          variant="outline"
          size="md"
          className="w-full"
          onClick={() => {
            window.location.href = `/dashboard/trader?symbol=${encodeURIComponent(analysis.symbol)}&signal=${analysis.signal}`;
          }}
        >
          <Target className="w-4 h-4" />
          Simulate Trade
        </Button>
        <Button
          variant="primary"
          size="md"
          className={`w-full ${
            isBearish
              ? "bg-bearish hover:bg-bearish/80"
              : "bg-bullish hover:bg-bullish/80"
          }`}
          onClick={() => {
            window.location.href = `/dashboard/trader?symbol=${encodeURIComponent(analysis.symbol)}&signal=${analysis.signal}&execute=1`;
          }}
        >
          {isBullish ? (
            <TrendingUp className="w-4 h-4" />
          ) : isBearish ? (
            <TrendingDown className="w-4 h-4" />
          ) : (
            <Activity className="w-4 h-4" />
          )}
          {isBullish ? "Execute Buy" : isBearish ? "Execute Sell" : "Execute"}
        </Button>
      </div>

      {/* Historical accuracy placeholder */}
      <div className="px-4 py-3 border-b border-border">
        <div className="rounded-lg bg-bg-elevated px-3 py-2.5">
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
            Pattern Accuracy
          </p>
          <p className="text-xs text-text-secondary">
            This signal pattern:{" "}
            <span className="font-mono font-medium text-text-primary">
              --% accurate
            </span>{" "}
            over{" "}
            <span className="font-mono font-medium text-text-primary">
              -- signals
            </span>
          </p>
        </div>
      </div>

      {/* Market Context */}
      <MarketContextSection symbol={analysis.symbol} />
    </div>
  );
}

// ─── Market Context (collapsible) ───────────────────────────────────

function MarketContextSection({ symbol }: { symbol: string }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="px-4 py-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 mb-3 w-full text-left cursor-pointer"
      >
        <Globe className="w-3.5 h-3.5 text-accent" />
        <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex-1">
          Market Context
        </p>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
        )}
      </button>

      {expanded && (
        <div className="space-y-4">
          {/* Analyst Consensus */}
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              Analyst Consensus
            </p>
            <AnalystConsensus symbol={symbol} />
          </div>

          {/* Insider Activity */}
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              Insider Activity
            </p>
            <InsiderActivity symbol={symbol} />
          </div>

          {/* Social Buzz */}
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              Social Buzz
            </p>
            <SocialBuzz symbol={symbol} />
          </div>

          {/* Peer Stocks */}
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              Related Stocks
            </p>
            <PeerStocks symbol={symbol} />
          </div>
        </div>
      )}
    </div>
  );
}
