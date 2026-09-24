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
        { label: "Today", value: "+$12.00", tone: "bullish" },
        { label: "Open", value: "−$3.00", tone: "bearish" },
        { label: "Connection", value: "Connected", tone: "neutral" },
      ],
    }),
  );

  it("is one bordered strip of borderless tiles, as a description list", () => {
    expect(html.match(/border-border/g)).toHaveLength(1);
    expect(html).toContain("<dl");
    expect(html.match(/<dt/g)).toHaveLength(3);
  });

  it("prints a direction glyph and hidden word beside a toned figure", () => {
    expect(html).toMatch(/▲<\/span>\+\$12\.00<span class="sr-only"> gain<\/span>/);
    expect(html).toMatch(/▼<\/span>−\$3\.00<span class="sr-only"> loss<\/span>/);
  });

  it("adds no glyph to a neutral word", () => {
    expect(html).toMatch(/text-text-primary">Connected<\/dd>/);
  });
});

describe("StatCard", () => {
  it("prints ▼ and a hidden loss beside a negative value", () => {
    const html = renderToStaticMarkup(createElement(StatCard, { label: "Drawdown", value: "−12%", tone: "negative" }));
    expect(html).toContain("▼");
    expect(html).toContain('<span class="sr-only"> loss</span>');
    expect(html).toContain("text-xl");
  });
});
