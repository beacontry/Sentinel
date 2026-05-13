"use client";

// Embedded TradingView Advanced Chart widget. Free for non-commercial use;
// gives the analysis page real-time TradingView data, full drawing tool
// suite (trendlines, fib retracements, channels, regressions), and ~250
// indicators without us having to ship/license anything.
//
// Used as an alternative view to `PriceChart` (which renders our engine's
// analyzed bars + signal/earnings markers). The Analysis page toggles
// between the two so users can switch from "what the engine saw" to "I
// want to draw on this myself."
//
// The widget is loaded via TradingView's CDN script that injects an iframe
// — fully sandboxed, no data leakage. We pass symbol + theme + interval
// and let the iframe handle the rest.

import { useEffect, useRef } from "react";
import { useTheme, isDarkTheme } from "@/components/theme-provider";

interface TradingViewChartProps {
  symbol: string;
  /** "1", "5", "15", "60", "D", "W". Default "D" (daily). */
  interval?: string;
  /** Container height in pixels. Default 600. Pass `"fill"` (or undefined when wrapped in a sized container) to fill the parent — used by the fullscreen overlay where the parent is the viewport. */
  height?: number | "fill";
}

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}

// TradingView expects equity tickers prefixed with an exchange. Most US
// equities live on NASDAQ or NYSE; rather than maintaining a lookup table
// for every symbol, we let TradingView's resolver do the work by passing
// just the symbol — it accepts "AAPL" and routes automatically.
function tvSymbol(raw: string): string {
  return raw.toUpperCase().trim();
}

export function TradingViewChart({
  symbol,
  interval = "D",
  height = 600,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!containerRef.current) return;

    // Reset before each render — TradingView's widget appends iframes
    // unconditionally and we don't want to accumulate them on remounts.
    containerRef.current.innerHTML = "";

    const containerId = `tv-chart-${Math.random().toString(36).slice(2, 8)}`;
    const inner = document.createElement("div");
    inner.id = containerId;
    inner.style.height = "100%";
    inner.style.width = "100%";
    containerRef.current.appendChild(inner);

    // Inject the TradingView script if not already present. Subsequent
    // mounts reuse the same global window.TradingView constructor.
    function instantiate() {
      if (!window.TradingView || !document.getElementById(containerId)) return;
      new window.TradingView.widget({
        container_id: containerId,
        symbol: tvSymbol(symbol),
        interval,
        timezone: "Etc/UTC",
        theme: isDarkTheme(theme) ? "dark" : "light",
        style: "1", // candles
        locale: "en",
        toolbar_bg: isDarkTheme(theme) ? "#1a1f1d" : "#f7f8f7",
        enable_publishing: false,
        allow_symbol_change: true,
        hide_side_toolbar: false,
        withdateranges: true,
        save_image: false,
        studies: [], // start empty; user adds via the widget toolbar
        autosize: true,
      });
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://s3.tradingview.com/tv.js"]'
    );
    if (existingScript && window.TradingView) {
      instantiate();
    } else if (existingScript) {
      // Script in flight — wait for it
      existingScript.addEventListener("load", instantiate, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/tv.js";
      script.async = true;
      script.onload = instantiate;
      document.head.appendChild(script);
    }

    // No teardown needed — the widget unmounts when we wipe the
    // container's innerHTML on next render. TradingView keeps the global
    // constructor alive across mounts which is what we want.
  }, [symbol, interval, theme]);

  // height === "fill" → take parent's full height (used by the
  // fullscreen overlay). Otherwise it's a number of pixels.
  const heightStyle: string = height === "fill" ? "100%" : `${height}px`;

  return (
    <div
      ref={containerRef}
      style={{ height: heightStyle, width: "100%" }}
      className="rounded-lg overflow-hidden border border-border bg-bg-secondary"
    />
  );
}
