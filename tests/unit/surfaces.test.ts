/**
 * Card and Inset (redesign plan, Stage 2): a group inside a card is an
 * Inset, one surface step up with no border, never a second card.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Card, CardTitle, Inset } from "@/components/ui/card";
import { PageIntro, statCh } from "@/components/layout/page-intro";
import { SignedValue } from "@/components/ui/signed-value";
import { StatCard } from "@/components/ui/stat-card";

describe("Card", () => {
  it("is the bordered container on the card fill", () => {
    const html = renderToStaticMarkup(createElement(Card, null, "x"));
    expect(html).toContain("border-border");
    expect(html).toContain("bg-bg-secondary");
    expect(html).toContain("rounded-xl");
  });

  it("names what its hover animates", () => {
    const html = renderToStaticMarkup(createElement(Card, { hover: true }, "x"));
    expect(html).toContain("transition-colors");
    expect(html).not.toContain("transition-all");
  });
});

describe("Inset", () => {
  const html = renderToStaticMarkup(createElement(Inset, null, "x"));

  it("steps up one surface and draws no border", () => {
    expect(html).toContain("bg-bg-surface");
    expect(html).not.toMatch(/\bborder\b/);
  });

  // A Modal or sheet is itself bg-surface, where a raised Inset is 1.00:1.
  it("sinks to bg-primary inside a bg-surface container", () => {
    const sunken = renderToStaticMarkup(createElement(Inset, { level: "sunken" }, "x"));
    expect(sunken).toContain("bg-bg-primary");
    expect(sunken).not.toContain("bg-bg-surface");
  });

  it("can render as another element", () => {
    expect(renderToStaticMarkup(createElement(Inset, { as: "section" }, "x"))).toMatch(/^<section\b/);
  });
});

describe("CardTitle", () => {
  it("is an h3 unless the page outline needs another level", () => {
    expect(renderToStaticMarkup(createElement(CardTitle, null, "t"))).toMatch(/^<h3\b/);
    expect(renderToStaticMarkup(createElement(CardTitle, { as: "h2" }, "t"))).toMatch(/^<h2\b/);
  });
});

describe("PageIntro stats", () => {
  const html = renderToStaticMarkup(
    createElement(PageIntro, {
      title: "Trader",
      description: "d",
      stats: [
        { label: "Today", value: "+$12.00", tone: "bullish", direction: "gain" },
        { label: "Open", value: "−$3.00", tone: "bearish", direction: "loss" },
        { label: "Connection", value: "Connected", tone: "neutral" },
        { label: "Risk Level", value: "HIGH", tone: "bearish" },
        { label: "Advancers", value: "--", tone: "bullish" },
      ],
    }),
  );

  it("is one bordered strip of borderless tiles, as a description list", () => {
    expect(html.match(/border-border/g)).toHaveLength(1);
    expect(html).toContain("<dl");
    expect(html.match(/<dt/g)).toHaveLength(5);
  });

  it("prints a direction glyph and hidden word when the caller names one", () => {
    expect(html).toMatch(/▲<\/span>\+\$12\.00<\/span><span class="sr-only"> gain<\/span>/);
    expect(html).toMatch(/▼<\/span>−\$3\.00<\/span><span class="sr-only"> loss<\/span>/);
  });

  // The glyph and figure are one run: a narrow tile must not leave the
  // glyph on one line and the amount on the next.
  it("keeps a direction glyph on the line of its figure", () => {
    expect(html).toMatch(/<span class="whitespace-nowrap"><span aria-hidden="true"[^>]*>▲<\/span>\+\$12\.00<\/span>/);
  });

  // wrap-anywhere split plain figures mid-number, and a nowrap SignedValue
  // ran past its tile and scrolled a 320px page sideways. The strip now
  // fits the widest whole figure, as the trader desk tiles do.
  it("fits every figure whole instead of splitting or overflowing it", () => {
    expect(html).not.toContain("wrap-anywhere");
    expect(html).toContain("tile-grid");
    expect(html.match(/figure-fit/g)).toHaveLength(5);
    expect(html.match(/@container/g)).toHaveLength(5);
    // The widest run here is the word "Connected" (9 ch), just ahead of
    // "+$12.00" with its glyph (7 + 1.75 ch): a word is not split either.
    expect(html).toContain("--figure-ch:9");
    expect(html).toMatch(/--tile-min:calc\(9 \* 0\.45rem \+ 1\.75rem\)/);
  });

  it("adds no glyph to a neutral word", () => {
    expect(html).toMatch(/text-text-primary">Connected<\/dd>/);
  });

  // A red risk level or a green placeholder is not a loss or a gain.
  it("never reads a direction off the colour tone", () => {
    expect(html).toMatch(/">HIGH<\/dd>/);
    expect(html).toMatch(/">--<\/dd>/);
    expect(html.match(/sr-only/g)).toHaveLength(2);
  });
});

describe("PageIntro statCh", () => {
  it("measures a plain string by its longest unbreakable token", () => {
    expect(statCh({ value: "$1234567.89" })).toBe(11);
    expect(statCh({ value: "90 days" })).toBe(4);
  });

  it("adds the glyph to a figure with a direction, as one run", () => {
    expect(statCh({ value: "+$12.00", direction: "gain" })).toBe(8.75);
  });

  it("asks a SignedValue for its own widest run", () => {
    const value = createElement(SignedValue, { value: -1234567.891, basis: 10_000_000, format: "both" });
    // "−$1,234,567.89" with its glyph; the percent "(−12.35%)" is shorter.
    expect(statCh({ value })).toBe(14 + 1.75);
  });

  it("asks nothing of a chip or other node, which wraps as words", () => {
    expect(statCh({ value: createElement("span", null, "Connected") })).toBe(0);
  });
});

describe("StatCard", () => {
  it("prints ▼ and a hidden loss when the value is a loss", () => {
    const html = renderToStaticMarkup(
      createElement(StatCard, { label: "Return", value: "−12%", tone: "negative", direction: "loss" }),
    );
    expect(html).toContain("▼");
    expect(html).toContain('<span class="sr-only"> loss</span>');
    expect(html).toContain("text-xl");
  });

  // Inside a panel a tile is an Inset, never a card in a card.
  it("renders as an Inset inside a panel", () => {
    const html = renderToStaticMarkup(createElement(StatCard, { label: "Trades", value: "42", surface: "inset" }));
    expect(html).toContain("bg-bg-surface");
    expect(html).not.toMatch(/\bborder\b/);
    expect(html).not.toContain("shadow-card");
  });

  it("is a bordered card on its own", () => {
    const html = renderToStaticMarkup(createElement(StatCard, { label: "Trades", value: "42" }));
    expect(html).toContain("border-border");
    expect(html).toContain("bg-bg-secondary");
  });

  it("colours a negative tone without claiming a loss", () => {
    const html = renderToStaticMarkup(createElement(StatCard, { label: "Max drawdown", value: "12%", tone: "negative" }));
    expect(html).not.toContain("▼");
    expect(html).not.toContain("sr-only");
  });

  it("draws a flat figure with – and no word", () => {
    const html = renderToStaticMarkup(createElement(StatCard, { label: "Return", value: "0.0%", direction: "flat" }));
    expect(html).toContain("–");
    expect(html).not.toContain("sr-only");
  });
});
