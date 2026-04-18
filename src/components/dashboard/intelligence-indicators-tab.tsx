"use client";

import type { AnalysisResult } from "@/types";
import { Activity, ArrowUpDown } from "lucide-react";

interface IntelligenceIndicatorsTabProps {
  analysis: AnalysisResult | null;
}

export function IntelligenceIndicatorsTab({ analysis }: IntelligenceIndicatorsTabProps) {
  if (!analysis) {
    return (
      <div className="text-xs text-text-muted text-center py-6">
        Run analysis to view indicator details
      </div>
    );
  }

  const { series, bars } = analysis;
  const rsiSeries = series.rsi_14;
  const macdLineSeries = series.macd_line;
  const macdSignalSeries = series.macd_signal;
  const macdHistogramSeries = series.macd_histogram;

  // Take last 40 data points for mini charts
  const len = Math.min(40, bars.length);
  const rsiData = rsiSeries.slice(-len);
  const macdData = macdLineSeries.slice(-len);
  const macdSigData = macdSignalSeries.slice(-len);
  const macdHistData = macdHistogramSeries.slice(-len);

  return (
    <div className="space-y-4">
      {/* RSI Chart */}
      <div className="rounded-lg bg-bg-elevated p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              RSI (14)
            </span>
          </div>
          <span className="font-mono text-sm text-text-primary">
            {analysis.indicators.rsi_14?.toFixed(1) ?? "--"}
          </span>
        </div>
        <MiniLineChart
          data={rsiData}
          height={60}
          thresholds={[30, 70]}
          color="var(--color-accent)"
        />
        <div className="flex justify-between text-[10px] text-text-muted mt-1">
          <span>Oversold (30)</span>
          <span>Overbought (70)</span>
        </div>
      </div>

      {/* MACD Chart */}
      <div className="rounded-lg bg-bg-elevated p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              MACD
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-text-primary">
              {analysis.indicators.macd_line?.toFixed(3) ?? "--"}
            </span>
            <span className="text-text-muted">/</span>
            <span className="font-mono text-text-secondary">
              {analysis.indicators.macd_signal?.toFixed(3) ?? "--"}
            </span>
          </div>
        </div>
        <MacdMiniChart
          macdLine={macdData}
          signalLine={macdSigData}
          histogram={macdHistData}
          height={60}
        />
        <div className="flex items-center gap-4 text-[10px] text-text-muted mt-1">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-0.5 bg-accent rounded-full" />
            MACD
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-0.5 bg-warning rounded-full" />
            Signal
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 bg-bullish/40 rounded-sm" />
            Histogram
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Mini SVG Charts ───────────────────────────────────────────

function MiniLineChart({
  data,
  height,
  thresholds,
  color,
}: {
  data: (number | null)[];
  height: number;
  thresholds?: number[];
  color: string;
}) {
  const validData = data.map((d) => d ?? 0);
  const min = Math.min(...validData, ...(thresholds ?? []));
  const max = Math.max(...validData, ...(thresholds ?? []));
  const range = max - min || 1;
  const width = 100; // percentage-based

  const points = validData.map((val, i) => {
    const x = (i / (validData.length - 1)) * 100;
    const y = height - ((val - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      className="w-full"
      preserveAspectRatio="none"
      style={{ height }}
    >
      {/* Threshold lines */}
      {thresholds?.map((t, i) => {
        const y = height - ((t - min) / range) * (height - 4) - 2;
        return (
          <line
            key={i}
            x1="0"
            y1={y}
            x2={width}
            y2={y}
            stroke="var(--color-border)"
            strokeWidth="0.5"
            strokeDasharray="2,2"
          />
        );
      })}
      {/* Line */}
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MacdMiniChart({
  macdLine,
  signalLine,
  histogram,
  height,
}: {
  macdLine: (number | null)[];
  signalLine: (number | null)[];
  histogram: (number | null)[];
  height: number;
}) {
  const allVals = [
    ...macdLine.map((d) => d ?? 0),
    ...signalLine.map((d) => d ?? 0),
    ...histogram.map((d) => d ?? 0),
  ];
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;

  const toY = (val: number) => height - ((val - min) / range) * (height - 4) - 2;
  const len = macdLine.length;

  const macdPoints = macdLine.map((val, i) => {
    const x = (i / (len - 1)) * 100;
    return `${x},${toY(val ?? 0)}`;
  });

  const sigPoints = signalLine.map((val, i) => {
    const x = (i / (len - 1)) * 100;
    return `${x},${toY(val ?? 0)}`;
  });

  const zeroY = toY(0);
  const barWidth = 100 / len;

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      className="w-full"
      preserveAspectRatio="none"
      style={{ height }}
    >
      {/* Zero line */}
      <line
        x1="0"
        y1={zeroY}
        x2="100"
        y2={zeroY}
        stroke="var(--color-border)"
        strokeWidth="0.5"
      />
      {/* Histogram bars */}
      {histogram.map((val, i) => {
        const v = val ?? 0;
        const x = (i / len) * 100;
        const barY = v >= 0 ? toY(v) : zeroY;
        const barH = Math.abs(toY(v) - zeroY);
        return (
          <rect
            key={i}
            x={x}
            y={barY}
            width={barWidth * 0.7}
            height={Math.max(barH, 0.5)}
            fill={v >= 0 ? "var(--color-bullish)" : "var(--color-bearish)"}
            opacity={0.4}
          />
        );
      })}
      {/* MACD line */}
      <polyline
        points={macdPoints.join(" ")}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      {/* Signal line */}
      <polyline
        points={sigPoints.join(" ")}
        fill="none"
        stroke="var(--color-warning)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
