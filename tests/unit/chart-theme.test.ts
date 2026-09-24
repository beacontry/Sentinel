/**
 * The price chart's up/down colours come from the theme tokens, so
 * colour-blind mode and the light themes reach it (WP14, finding #23).
 *
 * Candles, volume bars and event markers were hex literals (#3ddc97 /
 * #ff7b7b / #22c55e). Colour-blind mode only swaps --color-bullish and
 * --color-bearish on <html>, so the candles stayed red/green for a user
 * who had asked for blue/orange.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getChartTheme } from "@/lib/chart-theme";

/** Stand in for the browser: getComputedStyle(<html>) returns `tokens`. */
function stubTokens(tokens: Record<string, string>) {
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", { documentElement: {} });
  vi.stubGlobal("getComputedStyle", () => ({
    getPropertyValue: (name: string) => tokens[name] ?? "",
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getChartTheme", () => {
  it("reads the colour-blind bullish/bearish pair when the tokens carry it", () => {
    stubTokens({
      "--color-bullish": "#56B4E9",
      "--color-bearish": "#E69F00",
      "--color-bullish-muted": "rgba(86, 180, 233, 0.15)",
      "--color-bearish-muted": "rgba(230, 159, 0, 0.20)",
    });
    const t = getChartTheme();
    expect(t.bullish).toBe("#56B4E9");
    expect(t.bearish).toBe("#E69F00");
    expect(t.bullishMuted).toBe("rgba(86, 180, 233, 0.15)");
    expect(t.bearishMuted).toBe("rgba(230, 159, 0, 0.20)");
  });

  it("reads event marker colours from tokens", () => {
    stubTokens({ "--color-warning": "#b45309", "--color-accent": "#2563eb" });
    const t = getChartTheme();
    expect(t.eventEarnings).toBe("#b45309");
    expect(t.eventOther).toBe("#2563eb");
  });

  it("falls back to the light palette when a token is unset", () => {
    stubTokens({});
    const t = getChartTheme();
    expect(t.bullish).toBe("#059669");
    expect(t.bearish).toBe("#dc2626");
  });
});

describe("price-chart.tsx", () => {
  const src = readFileSync(
    join(__dirname, "..", "..", "src", "components", "dashboard", "price-chart.tsx"),
    "utf8",
  );

  it("has no literal candle, volume or marker colours left", () => {
    for (const literal of ["#3ddc97", "#ff7b7b", "rgba(61,220,151", "rgba(255,123,123"]) {
      expect(src).not.toContain(literal);
    }
    // Event markers. (#f59e0b is still the MACD signal line's colour.)
    expect(src).not.toMatch(/e\.type === "earnings" \? "#/);
  });

  it("remounts the chart when the theme or colour-blind mode changes", () => {
    expect(src).toMatch(/key=\{`\$\{theme\}:\$\{colorBlindMode\}`\}/);
  });
});
