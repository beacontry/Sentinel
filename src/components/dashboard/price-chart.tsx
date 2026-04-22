"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalysisResult } from "@/types";
import {
  createChart,
  createSeriesMarkers,
  type IChartApi,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type CandlestickData,
  type LineData,
  type HistogramData,
  type Time,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";

export interface ChartEvent {
  date: string;
  type: "earnings" | "dividend";
  label: string;
}

interface PriceChartProps {
  analysis: AnalysisResult;
  height?: number;
  events?: ChartEvent[];
}

const indicatorColors: Record<string, string> = {
  sma_9: "#10b981",
  sma_20: "#7dd3fc",
  sma_50: "#c084fc",
  ema_9: "#fb923c",
  ema_21: "#22d3ee",
  vwap: "#f472b6",
};

type VisibleIndicators = Record<string, boolean>;

const defaultVisible: VisibleIndicators = {
  sma_20: true,
  ema_9: true,
  ema_21: true,
  vwap: true,
  sma_9: false,
  sma_50: false,
};

function toTime(dateStr: string): Time {
  return Math.floor(new Date(dateStr).getTime() / 1000) as Time;
}

function makeChartOptions(container: HTMLElement, height: number) {
  return {
    width: container.clientWidth,
    height,
    layout: {
      background: { type: ColorType.Solid as const, color: "#ffffff" },
      textColor: "#64748b",
      fontFamily: "'Aptos', 'Segoe UI', sans-serif",
      fontSize: 11,
    },
    grid: {
      vertLines: { color: "#e2e8f0" },
      horzLines: { color: "#e2e8f0" },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: "#3d506f", labelBackgroundColor: "#1e293b" },
      horzLine: { color: "#3d506f", labelBackgroundColor: "#1e293b" },
    },
    rightPriceScale: {
      borderColor: "#e2e8f0",
      scaleMargins: { top: 0.1, bottom: 0.2 },
    },
    timeScale: {
      borderColor: "#e2e8f0",
      timeVisible: true,
      secondsVisible: false,
    },
  };
}

export function PriceChart({ analysis, height = 400, events }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const overlaySeriesRef = useRef<ReturnType<IChartApi["addSeries"]>[]>([]);
  const timesRef = useRef<Time[]>([]);
  const [visible, setVisible] = useState<VisibleIndicators>(defaultVisible);
  const [showRsi, setShowRsi] = useState(false);
  const [showMacd, setShowMacd] = useState(false);

  // Effect 1: Create chart with candlestick + volume (only on data change)
  useEffect(() => {
    if (!containerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    overlaySeriesRef.current = [];

    const container = containerRef.current;
    const chart = createChart(container, makeChartOptions(container, height));
    chartRef.current = chart;

    const times = analysis.bars.map((b) => toTime(b.date));
    timesRef.current = times;

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#3ddc97",
      downColor: "#ff7b7b",
      borderUpColor: "#3ddc97",
      borderDownColor: "#ff7b7b",
      wickUpColor: "#3ddc97",
      wickDownColor: "#ff7b7b",
    });
    const candleData: CandlestickData[] = analysis.bars.map((b, i) => ({
      time: times[i],
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    candleSeries.setData(candleData);

    // Event markers (earnings, dividends)
    if (events && events.length > 0) {
      const markers = events
        .map((e) => ({
          time: toTime(e.date),
          position: "aboveBar" as const,
          color: e.type === "earnings" ? "#f59e0b" : "#22c55e",
          shape: "circle" as const,
          text: e.type === "earnings" ? "E" : "D",
        }))
        .sort((a, b) => (a.time as number) - (b.time as number));
      createSeriesMarkers(candleSeries, markers);
    }

    // Volume histogram
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" as const },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    const volumeData: HistogramData[] = analysis.bars.map((b, i) => ({
      time: times[i],
      value: b.volume,
      color: b.close >= b.open ? "rgba(61,220,151,0.22)" : "rgba(255,123,123,0.22)",
    }));
    volumeSeries.setData(volumeData);

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      overlaySeriesRef.current = [];
    };
  }, [analysis, height, events]);

  // Effect 2: Add/remove indicator overlays without recreating chart
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const times = timesRef.current;

    // Remove previous overlay series
    for (const s of overlaySeriesRef.current) {
      try { chart.removeSeries(s); } catch { /* already removed */ }
    }
    overlaySeriesRef.current = [];

    const overlayKeys = ["sma_9", "sma_20", "sma_50", "ema_9", "ema_21", "vwap"] as const;

    for (const key of overlayKeys) {
      if (!visible[key]) continue;

      const values = analysis.series[key];
      if (!values) continue;

      const lineData: LineData[] = [];
      for (let i = 0; i < values.length; i++) {
        if (values[i] !== null) {
          lineData.push({ time: times[i], value: values[i] as number });
        }
      }
      if (lineData.length === 0) continue;

      const lineSeries = chart.addSeries(LineSeries, {
        color: indicatorColors[key] ?? "#6b7280",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      lineSeries.setData(lineData);
      overlaySeriesRef.current.push(lineSeries);
    }
  }, [visible, analysis]);

  function toggleIndicator(key: string) {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(indicatorColors).map(([key, color]) => (
          <button
            key={key}
            onClick={() => toggleIndicator(key)}
            className={`rounded-full border px-2.5 py-1 text-xs font-mono transition-all
              ${visible[key]
                ? "border-current bg-bg-secondary opacity-100"
                : "border-border opacity-50 hover:opacity-80"
              }`}
            style={{ color }}
          >
            {key.replace("_", " ").toUpperCase()}
          </button>
        ))}
      </div>

      <div
        ref={containerRef}
        className="overflow-hidden rounded-xl border border-border bg-bg-surface"
      />

      {showRsi && (
        <RsiSubChart
          bars={analysis.bars}
          values={analysis.series.rsi_14}
        />
      )}

      {showMacd && (
        <MacdSubChart
          bars={analysis.bars}
          macdLine={analysis.series.macd_line}
          signalLine={analysis.series.macd_signal}
          histogram={analysis.series.macd_histogram}
        />
      )}

      <div className="flex gap-1.5">
        <button
          onClick={() => setShowRsi(!showRsi)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all
            ${showRsi
              ? "border-accent/30 bg-accent/12 text-accent"
              : "border-border text-text-muted hover:border-border-hover hover:text-text-secondary"
            }`}
        >
          RSI
        </button>
        <button
          onClick={() => setShowMacd(!showMacd)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all
            ${showMacd
              ? "border-accent/30 bg-accent/12 text-accent"
              : "border-border text-text-muted hover:border-border-hover hover:text-text-secondary"
            }`}
        >
          MACD
        </button>
      </div>
    </div>
  );
}

function RsiSubChart({
  bars,
  values,
}: {
  bars: AnalysisResult["bars"];
  values: (number | null)[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height: 100,
      layout: {
        background: { type: ColorType.Solid as const, color: "#ffffff" },
        textColor: "#64748b",
        fontFamily: "'Aptos', 'Segoe UI', sans-serif",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "#e2e8f0" },
        horzLines: { color: "#e2e8f0" },
      },
      rightPriceScale: { borderColor: "#e2e8f0" },
      timeScale: { visible: false },
    });

    const series = chart.addSeries(LineSeries, {
      color: "#a855f7",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const data: LineData[] = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] !== null) {
        data.push({ time: toTime(bars[i].date), value: values[i] as number });
      }
    }
    series.setData(data);

    // Overbought / oversold lines
    series.createPriceLine({ price: 70, color: "rgba(239,68,68,0.4)", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "" });
    series.createPriceLine({ price: 30, color: "rgba(34,197,94,0.4)", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "" });

    chart.timeScale().fitContent();

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) chart.applyOptions({ width: e.contentRect.width });
    });
    ro.observe(ref.current);

    return () => { ro.disconnect(); chart.remove(); };
  }, [bars, values]);

  return (
    <div className="relative">
      <span className="absolute top-1 left-2 text-[10px] font-mono text-text-muted z-10">RSI (14)</span>
      <div ref={ref} className="overflow-hidden rounded-xl border border-border bg-bg-surface" />
    </div>
  );
}

function MacdSubChart({
  bars,
  macdLine,
  signalLine,
  histogram,
}: {
  bars: AnalysisResult["bars"];
  macdLine: (number | null)[];
  signalLine: (number | null)[];
  histogram: (number | null)[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height: 120,
      layout: {
        background: { type: ColorType.Solid as const, color: "#ffffff" },
        textColor: "#64748b",
        fontFamily: "'Aptos', 'Segoe UI', sans-serif",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "#e2e8f0" },
        horzLines: { color: "#e2e8f0" },
      },
      rightPriceScale: { borderColor: "#e2e8f0" },
      timeScale: { visible: false },
    });

    // Histogram
    const histSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "price" as const, precision: 4, minMove: 0.0001 },
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const histData: HistogramData[] = [];
    for (let i = 0; i < histogram.length; i++) {
      if (histogram[i] !== null) {
        histData.push({
          time: toTime(bars[i].date),
          value: histogram[i] as number,
          color: (histogram[i] as number) >= 0 ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)",
        });
      }
    }
    histSeries.setData(histData);

    // MACD line
    const macdSeries = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const macdData: LineData[] = [];
    for (let i = 0; i < macdLine.length; i++) {
      if (macdLine[i] !== null) {
        macdData.push({ time: toTime(bars[i].date), value: macdLine[i] as number });
      }
    }
    macdSeries.setData(macdData);

    // Signal line
    const sigSeries = chart.addSeries(LineSeries, {
      color: "#f59e0b",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const sigData: LineData[] = [];
    for (let i = 0; i < signalLine.length; i++) {
      if (signalLine[i] !== null) {
        sigData.push({ time: toTime(bars[i].date), value: signalLine[i] as number });
      }
    }
    sigSeries.setData(sigData);

    chart.timeScale().fitContent();

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) chart.applyOptions({ width: e.contentRect.width });
    });
    ro.observe(ref.current);

    return () => { ro.disconnect(); chart.remove(); };
  }, [bars, macdLine, signalLine, histogram]);

  return (
    <div className="relative">
      <span className="absolute top-1 left-2 text-[10px] font-mono text-text-muted z-10">MACD (12,26,9)</span>
      <div ref={ref} className="overflow-hidden rounded-xl border border-border bg-bg-surface" />
    </div>
  );
}
