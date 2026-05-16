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
import { getChartTheme } from "@/lib/chart-theme";

interface BacktestChartProps {
  equityCurve: { date: string; value: number }[];
  /** Override the default 300px height. Pass "fill" to take 100% of parent (used by fullscreen toggle). */
  height?: number | "fill";
}

export function BacktestChart({ equityCurve, height = 300 }: BacktestChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || equityCurve.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = containerRef.current;
    // When height==="fill", we want 100% of the parent. lightweight-charts
    // takes a numeric pixel value, so read clientHeight at mount time and
    // let the ResizeObserver below catch any subsequent layout shift.
    const initialHeight =
      height === "fill" ? container.clientHeight || 300 : height;

    try {
      const theme = getChartTheme();
      const chart = createChart(container, {
        width: container.clientWidth,
        height: initialHeight,
        layout: {
          background: { type: ColorType.Solid, color: theme.background },
          textColor: theme.textColor,
          fontFamily: "system-ui, sans-serif",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: theme.gridColor },
          horzLines: { color: theme.gridColor },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: theme.crosshairLine, labelBackgroundColor: theme.crosshairLabel },
          horzLine: { color: theme.crosshairLine, labelBackgroundColor: theme.crosshairLabel },
        },
        rightPriceScale: {
          borderColor: theme.gridColor,
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: {
          borderColor: theme.gridColor,
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
        color: theme.baselineColor,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "",
      });

      chart.timeScale().fitContent();

      const ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          // When parent is fullscreen (height="fill"), the chart needs
          // to track BOTH width and height changes — otherwise it stays
          // pinned at its mount-time height while the container grew to
          // fill the viewport.
          const opts: { width: number; height?: number } = { width: e.contentRect.width };
          if (height === "fill" && e.contentRect.height) {
            opts.height = e.contentRect.height;
          }
          chart.applyOptions(opts);
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
  }, [equityCurve, height]);

  return (
    <div
      ref={containerRef}
      className="rounded-lg overflow-hidden border border-border"
    />
  );
}
