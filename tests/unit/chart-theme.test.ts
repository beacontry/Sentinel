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
    expect(src).not.toMatch(/e\.type === "earnings" \? "#/);
  });

  it("remounts the chart when the theme or colour-blind mode changes", () => {
    expect(src).toMatch(/key=\{`\$\{theme\}:\$\{colorBlindMode\}`\}/);
  });
});

describe("every lightweight-charts caller", () => {
  // The chart library paints on a canvas, so a literal colour there is a
  // colour no theme or colour-blind switch can reach. The RSI/MACD
  // sub-charts, the backtest equity line and the replay page all had them.
  const root = join(__dirname, "..", "..", "src");
  const callers = [
    ["components", "dashboard", "price-chart.tsx"],
    ["components", "dashboard", "backtest-chart.tsx"],
    ["app", "dashboard", "replay", "page.tsx"],
  ];

  it.each(callers)("%s/%s/%s has no hex or rgb() colour literals", (...parts) => {
    const src = readFileSync(join(root, ...parts), "utf8");
    expect(src.match(/["'`]#[0-9a-fA-F]{3,8}["'`]|rgba?\(\s*\d/g) ?? []).toEqual([]);
  });

  it.each(callers)("%s/%s/%s sets no axis font size below 12px", (...parts) => {
    const src = readFileSync(join(root, ...parts), "utf8");
    expect(src).not.toMatch(/fontSize:\s*(?:[0-9]|1[01])\b/);
  });
});

describe("resolveColor", () => {
  it("passes a value through when there is no canvas (SSR, tests)", async () => {
    vi.resetModules();
    const { resolveColor } = await import("@/lib/chart-theme");
    expect(resolveColor("oklch(70% 0.15 162)")).toBe("oklch(70% 0.15 162)");
  });

  it("reads the painted pixel back as rgba() when a canvas exists", async () => {
    vi.resetModules();
    const painted = new Uint8ClampedArray([21, 186, 129, 255]);
    const ctx = {
      fillStyle: "",
      clearRect: () => {},
      fillRect: () => {},
      getImageData: () => ({ data: painted }),
    };
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ctx }) });
    const { resolveColor } = await import("@/lib/chart-theme");
    expect(resolveColor("oklch(70% 0.15 162)")).toBe("rgba(21, 186, 129, 1)");
  });

  it("returns an unparseable value unchanged rather than the sentinel", async () => {
    vi.resetModules();
    // A real canvas ignores an invalid fillStyle assignment.
    const ctx = {
      _fs: "",
      get fillStyle() {
        return this._fs;
      },
      set fillStyle(v: string) {
        if (v.startsWith("#")) this._fs = v;
      },
      clearRect: () => {},
      fillRect: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }),
    };
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ctx }) });
    const { resolveColor } = await import("@/lib/chart-theme");
    expect(resolveColor("not-a-colour")).toBe("not-a-colour");
  });
});

describe("withAlpha", () => {
  it("replaces the alpha of a resolved colour", async () => {
    const { withAlpha } = await import("@/lib/chart-theme");
    expect(withAlpha("rgba(21, 186, 129, 1)", 0.4)).toBe("rgba(21, 186, 129, 0.4)");
    expect(withAlpha("rgb(1, 2, 3)", 0.5)).toBe("rgba(1, 2, 3, 0.5)");
  });
});
