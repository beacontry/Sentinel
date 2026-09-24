/**
 * Landing page (redesign plan Stage 3e): no cards in cards, sample data
 * labelled as such, one header anatomy with no decorative kickers, no
 * glass, and accent fills labelled with the theme's on-accent colour
 * (WP14, findings #25 and #18).
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@/components/theme-provider";
import Home from "@/app/page";

const html = renderToStaticMarkup(createElement(ThemeProvider, null, createElement(Home)));
const classLists = [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1].split(/\s+/));

describe("structure", () => {
  it("has a skip link to the landmark it targets", () => {
    expect(html).toContain('<a href="#main" class="skip-link">');
    expect(html).toMatch(/<main id="main" tabindex="-1"/);
  });

  it("keeps every anchor the nav links to", () => {
    for (const id of ["features", "process", "platform", "pricing", "trust", "explore"]) {
      expect(html, id).toContain(`id="${id}"`);
    }
  });

  it("has one h1, and every section is named by its h2", () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    const labelled = [...html.matchAll(/<section[^>]*aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    expect(labelled.length).toBeGreaterThanOrEqual(7);
    for (const id of labelled) expect(html, id).toContain(`id="${id}"`);
  });

  it("drops the // code-comment kickers above section headings", () => {
    expect(html).not.toMatch(/&gt;\/\/ |>\/\/ /);
  });

  it("paints no glass: no backdrop blur and no translucent page fills", () => {
    for (const cls of classLists) {
      expect(cls.filter((c) => /backdrop-blur|^bg-(ld-deep|bg-primary)\//.test(c))).toEqual([]);
    }
  });
});

describe("sample data", () => {
  it("labels the equity illustration as demo data", () => {
    expect(html).toMatch(/<figure[\s\S]*Demo data[\s\S]*<\/figure>/);
  });
});

describe("accent CTAs", () => {
  it("never put a literal white label on the accent fill", () => {
    // Solid fills only (not bg-accent/8 tints), and only those that carry
    // a label colour (decorative dots have none).
    const labelled = classLists.filter(
      (cls) =>
        (cls.includes("bg-ld-accent") || cls.includes("bg-accent")) &&
        cls.some((c) => /^text-(white|ld-|on-accent)/.test(c)),
    );
    expect(labelled.length).toBeGreaterThanOrEqual(5);
    for (const cls of labelled) {
      expect(cls).not.toContain("text-white");
      expect(cls.includes("text-ld-on-accent") || cls.includes("text-on-accent")).toBe(true);
    }
  });
});
