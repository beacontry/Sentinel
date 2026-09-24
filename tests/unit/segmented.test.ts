/**
 * Segmented control (redesign plan, Stage 2): one "on" treatment, styled
 * from aria-pressed, for Buy/Sell, order type and engine mode.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Segmented } from "@/components/ui/segmented";

const noop = () => {};
const side = [
  { value: "buy", label: "Buy", icon: "▲", tone: "bullish" as const },
  { value: "sell", label: "Sell", icon: "▼", tone: "bearish" as const },
];

describe("Segmented", () => {
  const html = renderToStaticMarkup(createElement(Segmented, { options: side, value: "buy", onChange: noop, label: "Order side" }));

  it("is a named group of toggle buttons", () => {
    expect(html).toMatch(/^<div role="group" aria-label="Order side"/);
    expect(html.match(/<button type="button"/g)).toHaveLength(2);
  });

  it("marks exactly the chosen option pressed", () => {
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?Buy<\/button>/);
  });

  it("styles the chosen state from aria-pressed, not a parallel class", () => {
    expect(html).toContain("aria-pressed:bg-bullish-fill");
    expect(html).toContain("aria-pressed:bg-bearish-fill");
    expect(html).not.toMatch(/\bactive\b/);
  });

  it("prints the word and a hidden glyph for each side", () => {
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>▲<\/span>Buy/);
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>▼<\/span>Sell/);
  });

  it("pads each button's hit area past 44px", () => {
    expect(html).toContain("min-h-10");
    expect(html).toContain("before:-inset-y-1");
  });

  it("is disabled and busy until its value has loaded", () => {
    const busy = renderToStaticMarkup(
      createElement(Segmented, { options: side, value: null, onChange: noop, label: "Order side", busy: true }),
    );
    expect(busy).toContain('aria-busy="true"');
    expect(busy.match(/disabled=""/g)).toHaveLength(2);
    expect(busy).not.toContain('aria-pressed="true"');
  });
});
