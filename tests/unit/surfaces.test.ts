/**
 * Card and Inset (redesign plan, Stage 2): a group inside a card is an
 * Inset, one surface step up with no border, never a second card.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Card, CardTitle, Inset } from "@/components/ui/card";

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
