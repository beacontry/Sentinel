// Lightweight Charts theme adapter. Reads the current CSS custom
// properties at call time and returns a chart-config snippet that
// renders against whichever theme the user has active (light, dark,
// coral, light-blue, gray) and follows colour-blind mode.
//
// Two browser facts shape it:
// - getComputedStyle returns a custom property as written (with var()
//   substituted), so a token comes back as `oklch(70% 0.15 162)` or
//   `color-mix(in oklch, … 15%, transparent)`.
// - lightweight-charts parses colours itself and does not reliably
//   understand oklch() or color-mix().
// So every token passes through resolveColor(), which lets the browser's
// own colour parser paint it into a 1x1 canvas and reads the pixel back
// as rgba(). Outside a browser (SSR, unit tests) the value passes through
// unchanged.
//
// Theme changes during a chart's lifetime aren't reactive — the
// chart reads CSS tokens once on mount. For live re-theming, key the
// chart by `useTheme().theme` and `useDisplayPrefs().colorBlindMode`,
// so React unmounts/remounts on a switch (PriceChart does this).

export interface ChartThemeTokens {
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
  /** Up candles, gains. Follows colour-blind mode (--color-bullish). */
  bullish: string;
  /** Down candles, losses. Follows colour-blind mode (--color-bearish). */
  bearish: string;
  /** Up volume bars: translucent bullish. */
  bullishMuted: string;
  /** Down volume bars: translucent bearish. */
  bearishMuted: string;
  /** Earnings event marker. */
  eventEarnings: string;
  /** Other event markers (dividends). */
  eventOther: string;
  /** Categorical palette for indicator lines, --color-series-1 … 6. */
  series: [string, string, string, string, string, string];
}

/** Axis text size. The 12px floor applies to chart ticks too. */
export const CHART_FONT_SIZE = 12;

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
  series: ["#0f766e", "#0369a1", "#7e22ce", "#c2410c", "#0e7490", "#be185d"],
};

let probe: CanvasRenderingContext2D | null | undefined;

/**
 * Any CSS colour the browser understands, as `rgba(r, g, b, a)`. Returns
 * the input unchanged when there is no canvas (SSR, tests) or the browser
 * cannot parse it.
 */
export function resolveColor(value: string): string {
  if (probe === undefined) {
    try {
      const canvas =
        typeof document !== "undefined" && typeof document.createElement === "function"
          ? document.createElement("canvas")
          : null;
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
      probe = canvas?.getContext("2d", { willReadFrequently: true }) ?? null;
    } catch {
      probe = null;
    }
  }
  if (!probe || !value) return value;

  // An unparseable fillStyle is ignored, so paint a sentinel first and
  // check the assignment took.
  probe.fillStyle = "#010203";
  probe.fillStyle = value;
  if (probe.fillStyle === "#010203" && value.trim().toLowerCase() !== "#010203") return value;
  probe.clearRect(0, 0, 1, 1);
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 1000) / 1000})`;
}

/** The same colour at a different opacity. Takes a resolved `rgba()`. */
export function withAlpha(rgba: string, alpha: number): string {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(rgba);
  return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})` : rgba;
}

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
  return resolveColor(value || fallback);
}

/**
 * Snapshot the current theme's chart-relevant tokens into a plain
 * object. Call this once during chart initialization. Returns a
 * sensible light-mode default during SSR.
 */
export function getChartTheme(): ChartThemeTokens {
  if (typeof window === "undefined") return DEFAULT_LIGHT;
  const s = DEFAULT_LIGHT.series;
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
    series: [
      readToken("--color-series-1", s[0]),
      readToken("--color-series-2", s[1]),
      readToken("--color-series-3", s[2]),
      readToken("--color-series-4", s[3]),
      readToken("--color-series-5", s[4]),
      readToken("--color-series-6", s[5]),
    ],
  };
}
