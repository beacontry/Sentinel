/**
 * The OKLCH-to-sRGB maths the theme contrast test depends on. If this is
 * wrong, every figure in theme-contrast.test.ts is wrong with it.
 */

import { describe, it, expect } from "vitest";
import { contrastRatio, deltaEOK, parseColor, toHex } from "@/lib/color-contrast";

describe("parseColor", () => {
  it("reads 6- and 3-digit hex", () => {
    expect(parseColor("#ffffff")).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(parseColor("#FFF")).toEqual({ r: 1, g: 1, b: 1, a: 1 });
  });

  it("reads rgb() in comma and space syntax, with alpha", () => {
    expect(parseColor("rgb(255 255 255 / 0.045)").a).toBeCloseTo(0.045, 5);
    expect(parseColor("rgba(0, 0, 0, 0.5)").a).toBeCloseTo(0.5, 5);
  });

  it("reads oklch with a percentage lightness", () => {
    const white = parseColor("oklch(100% 0 0)");
    expect(white.r).toBeCloseTo(1, 3);
    expect(white.g).toBeCloseTo(1, 3);
    expect(white.b).toBeCloseTo(1, 3);
    expect(parseColor("oklch(0% 0 0)").r).toBeCloseTo(0, 5);
  });

  it("throws on syntax it does not know, instead of guessing", () => {
    expect(() => parseColor("color-mix(in oklch, red 10%, transparent)")).toThrow();
    expect(() => parseColor("hsl(0 0% 0%)")).toThrow();
    expect(() => parseColor("#12345")).toThrow();
  });
});

describe("toHex", () => {
  it("round-trips known OKLCH values to their sRGB hex", () => {
    // Reference values from the CSS Color 4 conversion (oklch.com).
    expect(toHex("oklch(62.8% 0.2577 29.23)")).toBe("#ff0000");
    expect(toHex("oklch(17% 0.020 163)")).toBe("#07120d");
    expect(toHex("#10b981")).toBe("#10b981");
  });
});

describe("contrastRatio", () => {
  it("is symmetric and 1:1 for identical colours", () => {
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#000000"), 10);
  });

  it("agrees with the published figure for white on emerald-500", () => {
    expect(contrastRatio("#ffffff", "#10b981")).toBeCloseTo(2.54, 2);
  });

  it("composites a translucent foreground over the background first", () => {
    // Fully transparent black on white is white on white.
    expect(contrastRatio("rgb(0 0 0 / 0)", "#ffffff")).toBeCloseTo(1, 5);
    // Half black on white lands between the two.
    const half = contrastRatio("rgb(0 0 0 / 0.5)", "#ffffff");
    expect(half).toBeGreaterThan(1);
    expect(half).toBeLessThan(21);
  });

  it("refuses a translucent background", () => {
    expect(() => contrastRatio("#000000", "rgb(255 255 255 / 0.5)")).toThrow();
  });
});

describe("deltaEOK", () => {
  it("is 0 for identical colours and 1 from black to white", () => {
    expect(deltaEOK("#b63325", "#b63325")).toBeCloseTo(0, 6);
    expect(deltaEOK("#000000", "#ffffff")).toBeCloseTo(1, 3);
  });

  it("agrees across hex and oklch spellings of the same colour", () => {
    expect(deltaEOK("oklch(52% 0.17 30)", "oklch(52% 0.19 27)")).toBeLessThan(0.03);
    expect(deltaEOK("#f97066", "#b91c1c")).toBeCloseTo(0.204, 2);
  });

  it("refuses a translucent colour", () => {
    expect(() => deltaEOK("rgb(0 0 0 / 0.5)", "#ffffff")).toThrow();
  });
});
