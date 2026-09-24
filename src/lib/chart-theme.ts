// Lightweight Charts theme adapter. Reads the current CSS custom
// properties at call time and returns a chart-config snippet that
// renders against whichever theme the user has active (light, dark,
// coral, light-blue, gray). Replaces the hardcoded #ffffff / #e2e8f0
// / #64748b values that used to jam a permanent light-mode look into
// every chart regardless of the surrounding dashboard theme.
//
// Theme changes during a chart's lifetime aren't reactive — the
// chart reads CSS tokens once on mount. If you want live
// re-theming, key the chart by `useTheme().theme` and, when it draws
// up/down colours, by `useDisplayPrefs().colorBlindMode` too, so React
// unmounts/remounts on a switch (PriceChart does this).

interface ChartThemeTokens {
  /** Chart canvas background. */
  background: string;
  /** Axis labels + crosshair labels. */
  textColor: string;
  /** Grid lines + scale borders. */
  gridColor: string;
  /** Crosshair guide lines. */
  crosshairLine: string;
  /** Crosshair label pill background. */
  crosshairLabel: string;
  /** Default series stroke (e.g. price line). */
  seriesPrimary: string;
  /** Neutral price-line/baseline color. */
  baselineColor: string;
  /** Up candles. Follows colour-blind mode (--color-bullish). */
  bullish: string;
  /** Down candles. Follows colour-blind mode (--color-bearish). */
  bearish: string;
  /** Up volume bars: translucent bullish. */
  bullishMuted: string;
  /** Down volume bars: translucent bearish. */
  bearishMuted: string;
  /** Earnings event marker. */
  eventEarnings: string;
  /** Other event markers (dividends). */
  eventOther: string;
}

const DEFAULT_LIGHT: ChartThemeTokens = {
  background: "#ffffff",
  textColor: "#64748b",
  gridColor: "#e2e8f0",
  crosshairLine: "#cbd5e1",
  crosshairLabel: "#1e293b",
  seriesPrimary: "#10b981",
  baselineColor: "#94a3b8",
  bullish: "#059669",
  bearish: "#dc2626",
  bullishMuted: "rgba(5, 150, 105, 0.10)",
  bearishMuted: "rgba(220, 38, 38, 0.10)",
  eventEarnings: "#d97706",
  eventOther: "#10b981",
};

/**
 * Read a CSS custom property from :root, returning the provided
 * fallback if the value isn't set yet (e.g. during SSR or before
 * the stylesheet has parsed).
 */
function readToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/**
 * Snapshot the current theme's chart-relevant tokens into a plain
 * object. Call this once during chart initialization. Returns a
 * sensible light-mode default during SSR.
 */
export function getChartTheme(): ChartThemeTokens {
  if (typeof window === "undefined") return DEFAULT_LIGHT;
  return {
    background: readToken("--color-bg-surface", DEFAULT_LIGHT.background),
    textColor: readToken("--color-text-secondary", DEFAULT_LIGHT.textColor),
    gridColor: readToken("--color-border", DEFAULT_LIGHT.gridColor),
    crosshairLine: readToken("--color-border-hover", DEFAULT_LIGHT.crosshairLine),
    crosshairLabel: readToken("--color-bg-elevated", DEFAULT_LIGHT.crosshairLabel),
    seriesPrimary: readToken("--color-accent", DEFAULT_LIGHT.seriesPrimary),
    baselineColor: readToken("--color-text-muted", DEFAULT_LIGHT.baselineColor),
    bullish: readToken("--color-bullish", DEFAULT_LIGHT.bullish),
    bearish: readToken("--color-bearish", DEFAULT_LIGHT.bearish),
    bullishMuted: readToken("--color-bullish-muted", DEFAULT_LIGHT.bullishMuted),
    bearishMuted: readToken("--color-bearish-muted", DEFAULT_LIGHT.bearishMuted),
    eventEarnings: readToken("--color-warning", DEFAULT_LIGHT.eventEarnings),
    eventOther: readToken("--color-accent", DEFAULT_LIGHT.eventOther),
  };
}
