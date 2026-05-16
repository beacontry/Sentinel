// Lightweight Charts theme adapter. Reads the current CSS custom
// properties at call time and returns a chart-config snippet that
// renders against whichever theme the user has active (light, dark,
// coral, light-blue, gray). Replaces the hardcoded #ffffff / #e2e8f0
// / #64748b values that used to jam a permanent light-mode look into
// every chart regardless of the surrounding dashboard theme.
//
// Theme changes during a chart's lifetime aren't reactive — the
// chart reads CSS tokens once on mount. If you want live
// re-theming, key the chart's parent <div> by `useTheme().theme` so
// React unmounts/remounts on switch. For the dashboard's current
// flow (mount on page load, theme changes are rare) this is fine.

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
}

const DEFAULT_LIGHT: ChartThemeTokens = {
  background: "#ffffff",
  textColor: "#64748b",
  gridColor: "#e2e8f0",
  crosshairLine: "#cbd5e1",
  crosshairLabel: "#1e293b",
  seriesPrimary: "#10b981",
  baselineColor: "#94a3b8",
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
  };
}
