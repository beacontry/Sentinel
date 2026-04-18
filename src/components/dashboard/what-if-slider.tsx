"use client";

import { useState, useEffect, useMemo } from "react";
import type { AnalysisResult } from "@/types";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";

interface WhatIfSliderProps {
  analysis: AnalysisResult;
  accountSize?: number;
  positionPct?: number;
}

export function WhatIfSlider({
  analysis,
  accountSize = 10000,
  positionPct = 10,
}: WhatIfSliderProps) {
  const entryPrice = analysis.price;
  const [simPrice, setSimPrice] = useState(entryPrice);

  useEffect(() => {
    setSimPrice(entryPrice);
  }, [entryPrice, analysis.symbol]);

  const isBearish = analysis.signal === "SELL" || analysis.signal === "STRONG_SELL";
  const direction = isBearish ? -1 : 1;

  const minPrice = +(entryPrice * 0.9).toFixed(2);
  const maxPrice = +(entryPrice * 1.1).toFixed(2);
  const stopLoss = +(entryPrice * 0.98).toFixed(2);
  const takeProfit = +(entryPrice * 1.03).toFixed(2);

  const computed = useMemo(() => {
    const allocatedCapital = accountSize * (positionPct / 100);
    const shares = Math.floor(allocatedCapital / entryPrice);
    const pnl = (simPrice - entryPrice) * shares * direction;
    const movePct = ((simPrice - entryPrice) / entryPrice) * 100;
    const pnlPct = allocatedCapital > 0 ? (pnl / allocatedCapital) * 100 : 0;

    const baseProb = analysis.confidence * 100;
    const winProbability = Math.max(5, Math.min(95, Math.round(baseProb + movePct * 2 * direction)));

    const riskExposure: "Low" | "Medium" | "High" =
      Math.abs(movePct) < 2 ? "Low" : Math.abs(movePct) < 5 ? "Medium" : "High";

    const hitStop = direction > 0 ? simPrice <= stopLoss : simPrice >= takeProfit;
    const hitTP = direction > 0 ? simPrice >= takeProfit : simPrice <= stopLoss;

    return { allocatedCapital, shares, pnl, movePct, pnlPct, winProbability, riskExposure, hitStop, hitTP };
  }, [simPrice, entryPrice, accountSize, positionPct, direction, analysis.confidence, stopLoss, takeProfit]);

  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            What-If Simulation
          </h3>
          <p className="text-xs text-text-muted">
            Drag the price to model the trade outcome.
          </p>
        </div>
        <Badge variant="bullish">Interactive</Badge>
      </div>

      {/* Price labels */}
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>${minPrice}</span>
        <span className="text-text-secondary font-mono font-medium">${simPrice.toFixed(2)}</span>
        <span>${maxPrice}</span>
      </div>

      {/* Slider */}
      <input
        type="range"
        min={minPrice}
        max={maxPrice}
        step={0.01}
        value={simPrice}
        onChange={(e) => setSimPrice(Number(e.target.value))}
        className="w-full accent-emerald-500"
      />

      {/* SL / TP row */}
      <div className="flex justify-between text-xs">
        <span className="text-bearish">SL: ${stopLoss}</span>
        <span className="text-text-muted">Entry: ${entryPrice.toFixed(2)}</span>
        <span className="text-bullish">TP: ${takeProfit}</span>
      </div>

      {/* Results */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Projected P/L"
          value={`${computed.pnl >= 0 ? "+" : ""}$${computed.pnl.toFixed(0)}`}
          subtext={`${computed.movePct.toFixed(2)}% move`}
          tone={computed.pnl >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label="Win Probability"
          value={`${computed.winProbability}%`}
          subtext="dynamic estimate"
          tone="positive"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Risk Exposure"
          value={computed.riskExposure}
          subtext="based on simulated move"
        />
        <StatCard
          label="Capital Used"
          value={`$${computed.allocatedCapital.toLocaleString()}`}
          subtext={`${positionPct}% of portfolio`}
        />
      </div>

      {/* Status */}
      {(computed.hitStop || computed.hitTP) && (
        <div className="text-xs">
          {computed.hitStop && (
            <span className="px-2.5 py-1 rounded-full bg-bearish/10 text-bearish font-medium border border-bearish/20">Stop Loss Hit</span>
          )}
          {computed.hitTP && (
            <span className="px-2.5 py-1 rounded-full bg-bullish/10 text-bullish font-medium border border-bullish/20">Take Profit Hit</span>
          )}
        </div>
      )}
    </div>
  );
}
