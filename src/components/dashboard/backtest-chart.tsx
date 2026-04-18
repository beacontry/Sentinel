"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  type IChartApi,
  LineSeries,
  type LineData,
  type Time,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";

interface BacktestChartProps {
  equityCurve: { date: string; value: number }[];
}

export function BacktestChart({ equityCurve }: BacktestChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || equityCurve.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 300,
      layout: {
        background: { type: ColorType.Solid, color: "#0a0e17" },
        textColor: "#94a3b8",
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#334155", labelBackgroundColor: "#1a1f2e" },
        horzLine: { color: "#334155", labelBackgroundColor: "#1a1f2e" },
      },
      rightPriceScale: {
        borderColor: "#1e293b",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "#1e293b",
        timeVisible: true,
      },
    });
    chartRef.current = chart;

    const lastValue = equityCurve[equityCurve.length - 1]?.value ?? 10000;
    const isProfit = lastValue >= 10000;

    const series = chart.addSeries(LineSeries, {
      color: isProfit ? "#22c55e" : "#ef4444",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
    });

    const data: LineData[] = equityCurve.map((p) => ({
      time: (Math.floor(new Date(p.date).getTime() / 1000)) as Time,
      value: p.value,
    }));

    series.setData(data);

    // Starting capital reference line
    series.createPriceLine({
      price: 10000,
      color: "#64748b",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "",
    });

    chart.timeScale().fitContent();

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        chart.applyOptions({ width: e.contentRect.width });
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [equityCurve]);

  return (
    <div
      ref={containerRef}
      className="rounded-lg overflow-hidden border border-border"
    />
  );
}
