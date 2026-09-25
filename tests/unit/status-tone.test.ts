/**
 * One status colour map (src/lib/status-tone.ts), and the primitives read
 * from it rather than keeping their own alpha-tint strings.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STATUS_TONE_CLASSES,
  STATUS_TONE_FILL_CLASSES,
  STATUS_TONE_TEXT_CLASSES,
  tradeStatusTone,
} from "@/lib/status-tone";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";

describe("tradeStatusTone", () => {
  it.each([
    ["FILLED", "bullish"],
    ["filled", "bullish"],
    ["PARTIAL_FILLED", "warning"],
    ["partially_filled", "warning"],
    ["REJECTED", "bearish"],
    ["FAILED", "bearish"],
    ["PENDING", "neutral"],
    ["new", "neutral"],
    ["accepted", "neutral"],
    ["CANCELED", "neutral"],
    ["EXPIRED", "neutral"],
    ["something_new_from_the_broker", "neutral"],
    ["", "neutral"],
    [null, "neutral"],
    [undefined, "neutral"],
  ])("%s → %s", (status, tone) => {
    expect(tradeStatusTone(status)).toBe(tone);
  });
});

describe("tone classes", () => {
  it("state chips use the measured triplet, never an alpha tint", () => {
    for (const tone of ["bullish", "bearish", "warning"] as const) {
      expect(STATUS_TONE_CLASSES[tone]).toBe(`border-${tone}-line bg-${tone}-fill text-${tone}-fg`);
      expect(STATUS_TONE_FILL_CLASSES[tone]).toBe(`bg-${tone}-fill text-${tone}-fg`);
      expect(STATUS_TONE_TEXT_CLASSES[tone]).toBe(`text-${tone}`);
    }
  });
});

describe("primitives read the map", () => {
  it("Badge renders the tone's classes", () => {
    const html = renderToStaticMarkup(Badge({ variant: "bearish", children: "Rejected" }));
    for (const c of STATUS_TONE_CLASSES.bearish.split(" ")) expect(html).toContain(c);
    expect(html).not.toMatch(/bg-bearish\/\d/);
  });

  it("StatCard colours a signed value with the state text class", () => {
    const html = renderToStaticMarkup(createElement(StatCard, { label: "P&L", value: "−$5.00", tone: "negative" }));
    expect(html).toContain("text-bearish");
  });

  it.each([
    ["src/components/ui/badge.tsx"],
    ["src/components/ui/stat-card.tsx"],
    ["src/components/layout/page-intro.tsx"],
    ["src/components/ui/toast.tsx"],
  ])("%s keeps no alpha-tint state strings of its own", (file) => {
    const src = readFileSync(join(__dirname, "..", "..", file), "utf8");
    expect(src).not.toMatch(/(?:bg|border)-(?:bullish|bearish|warning)\/\d+/);
  });
});
