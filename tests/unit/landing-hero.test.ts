/**
 * Landing page: the hero card holds a plain list, not cards in a card,
 * and the accent CTAs use the theme's on-accent label (WP14, findings
 * #25 and #18).
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@/components/theme-provider";
import Home from "@/app/page";

const html = renderToStaticMarkup(createElement(ThemeProvider, null, createElement(Home)));

describe("hero checklist", () => {
  const list = /<ul data-hero-checklist[^>]*>([\s\S]*?)<\/ul>/.exec(html);

  it("renders", () => {
    expect(list).not.toBeNull();
  });

  it("items are not bordered, filled or hover-shifted cards", () => {
    const items = [...list![1].matchAll(/<li class="([^"]*)"/g)].map((m) => m[1].split(/\s+/));
    expect(items.length).toBeGreaterThan(0);
    for (const cls of items) {
      expect(cls.filter((c) => /^(border|rounded|bg-|hover:)/.test(c))).toEqual([]);
    }
  });
});

describe("accent CTAs", () => {
  it("never put a literal white label on the landing accent fill", () => {
    // Solid fills only (not bg-ld-accent/8 tints), and only those that
    // carry a label colour (decorative dots have none).
    const labelled = [...html.matchAll(/class="([^"]*)"/g)]
      .map((m) => m[1].split(/\s+/))
      .filter(
        (cls) =>
          (cls.includes("bg-ld-accent") || cls.includes("bg-accent")) &&
          cls.some((c) => /^text-(white|ld-|on-accent)/.test(c)),
      );
    // The CTAs are ButtonLinks now (bg-accent + text-on-accent), which the
    // landing's ld-accent aliases resolve to the same colours.
    expect(labelled.length).toBeGreaterThanOrEqual(5);
    for (const cls of labelled) {
      expect(cls).not.toContain("text-white");
      expect(cls.includes("text-ld-on-accent") || cls.includes("text-on-accent")).toBe(true);
    }
  });
});
