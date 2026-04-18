"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Activity } from "lucide-react";

interface VolatilityData {
  symbol: string;
  price: number;
  atr: number | null;
  atrPercent: number | null;
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  bollingerBandwidth: number | null;
  historicalVol: number | null;
}

interface VolatilityPanelProps {
  symbol: string;
}

function volLevel(val: number): { label: string; variant: "bullish" | "bearish" | "warning" } {
  if (val >= 40) return { label: "High", variant: "bearish" };
  if (val >= 20) return { label: "Moderate", variant: "warning" };
  return { label: "Low", variant: "bullish" };
}

function pricePosition(
  price: number,
  upper: number | null,
  middle: number | null,
  lower: number | null
): { label: string; color: string } {
  if (upper === null || middle === null || lower === null) {
    return { label: "--", color: "text-text-muted" };
  }
  const range = upper - lower;
  if (range === 0) return { label: "--", color: "text-text-muted" };

  const pctB = (price - lower) / range;

  if (pctB >= 0.8) return { label: "Near Upper", color: "text-bearish" };
  if (pctB >= 0.6) return { label: "Above Mid", color: "text-warning" };
  if (pctB >= 0.4) return { label: "Near Middle", color: "text-text-secondary" };
  if (pctB >= 0.2) return { label: "Below Mid", color: "text-warning" };
  return { label: "Near Lower", color: "text-bullish" };
}

export function VolatilityPanel({ symbol }: VolatilityPanelProps) {
  const [data, setData] = useState<VolatilityData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchVolatility() {
      setLoading(true);
      try {
        const res = await fetch(`/api/volatility/${encodeURIComponent(symbol)}`);
        if (!res.ok) return;
        const json = await res.json();
        setData(json);
      } catch {
        // Non-critical -- volatility panel is supplemental
      } finally {
        setLoading(false);
      }
    }
    fetchVolatility();
  }, [symbol]);

  return (
    <Card>
      <CardHeader className="p-0 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent" />
          Volatility
        </CardTitle>
        {data?.historicalVol != null && (
          <Badge variant={volLevel(data.historicalVol).variant}>
            {volLevel(data.historicalVol).label}
          </Badge>
        )}
      </CardHeader>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      ) : !data ? (
        <p className="text-sm text-text-muted py-4 text-center">
          No volatility data available
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* ATR (14) */}
          <div className="p-3 rounded-lg bg-bg-elevated">
            <p className="text-xs text-text-muted mb-1">ATR (14)</p>
            <p className="font-mono text-sm text-text-primary">
              {data.atr !== null ? `$${data.atr.toFixed(2)}` : "--"}
            </p>
            {data.atrPercent !== null && (
              <p
                className={`font-mono text-xs mt-0.5 ${
                  data.atrPercent >= 3
                    ? "text-bearish"
                    : data.atrPercent >= 1.5
                      ? "text-warning"
                      : "text-bullish"
                }`}
              >
                {data.atrPercent.toFixed(2)}% of price
              </p>
            )}
          </div>

          {/* Historical Volatility */}
          <div className="p-3 rounded-lg bg-bg-elevated">
            <p className="text-xs text-text-muted mb-1">Historical Vol</p>
            <p
              className={`font-mono text-sm ${
                data.historicalVol !== null
                  ? data.historicalVol >= 40
                    ? "text-bearish"
                    : data.historicalVol >= 20
                      ? "text-warning"
                      : "text-bullish"
                  : "text-text-primary"
              }`}
            >
              {data.historicalVol !== null
                ? `${data.historicalVol.toFixed(1)}%`
                : "--"}
            </p>
            <p className="text-xs text-text-muted mt-0.5">annualized</p>
          </div>

          {/* Bollinger Bandwidth */}
          <div className="p-3 rounded-lg bg-bg-elevated">
            <p className="text-xs text-text-muted mb-1">Bollinger Width</p>
            <p
              className={`font-mono text-sm ${
                data.bollingerBandwidth !== null
                  ? data.bollingerBandwidth >= 15
                    ? "text-bearish"
                    : data.bollingerBandwidth >= 8
                      ? "text-warning"
                      : "text-bullish"
                  : "text-text-primary"
              }`}
            >
              {data.bollingerBandwidth !== null
                ? `${data.bollingerBandwidth.toFixed(2)}%`
                : "--"}
            </p>
            <p className="text-xs text-text-muted mt-0.5">band spread</p>
          </div>

          {/* Price Position in Bollinger Bands */}
          <div className="p-3 rounded-lg bg-bg-elevated">
            <p className="text-xs text-text-muted mb-1">Price Position</p>
            {(() => {
              const pos = pricePosition(
                data.price,
                data.bollingerUpper,
                data.bollingerMiddle,
                data.bollingerLower
              );
              return (
                <>
                  <p className={`font-mono text-sm ${pos.color}`}>
                    {pos.label}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    in Bollinger
                  </p>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </Card>
  );
}
