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

    try {
      const chart = createChart(container, {
        width: container.clientWidth,
        height: 300,
        layout: {
          background: { type: ColorType.Solid, color: "#ffffff" },
          textColor: "#64748b",
          fontFamily: "system-ui, sans-serif",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "#e2e8f0" },
          horzLines: { color: "#e2e8f0" },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: "#cbd5e1", labelBackgroundColor: "#1e293b" },
          horzLine: { color: "#cbd5e1", labelBackgroundColor: "#1e293b" },
        },
        rightPriceScale: {
          borderColor: "#e2e8f0",
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: {
          borderColor: "#e2e8f0",
          timeVisible: true,
        },
      });
      chartRef.current = chart;

      const lastValue = equityCurve[equityCurve.length - 1]?.value ?? 10000;
      const isProfit = lastValue >= 10000;

      const series = chart.addSeries(LineSeries, {
        color: isProfit ? "#059669" : "#dc2626",
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

      series.createPriceLine({
        price: 10000,
        color: "#94a3b8",
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
    } catch (err) {
      console.error("Chart init failed:", err);
    }
  }, [equityCurve]);

  return (
    <div
      ref={containerRef}
      className="rounded-lg overflow-hidden border border-border"
    />
  );
}
