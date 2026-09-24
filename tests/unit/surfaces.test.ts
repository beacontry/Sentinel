/**
 * Card and Inset (redesign plan, Stage 2): a group inside a card is an
 * Inset, one surface step up with no border, never a second card.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Card, CardTitle, Inset } from "@/components/ui/card";
import { PageIntro } from "@/components/layout/page-intro";
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
    expect(html).toMatch(/▲<\/span>\+\$12\.00<span class="sr-only"> gain<\/span>/);
    expect(html).toMatch(/▼<\/span>−\$3\.00<span class="sr-only"> loss<\/span>/);
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
