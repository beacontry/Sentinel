/**
 * Skeleton and LoadingRegion (redesign plan, Stage 2).
 *
 * The skeleton sheen was a literal rgba(0,0,0,0.04), invisible on the
 * dark themes; it is now the --color-skeleton-sheen token. Blocks are
 * aria-hidden, and the region around them announces the load once
 * through a status line that stays mounted.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingRegion, LiveRegion } from "@/components/ui/live-region";

describe("Skeleton", () => {
  const html = renderToStaticMarkup(createElement(Skeleton, { height: "40px" }));

  it("draws its sheen from the theme token", () => {
    expect(html).toContain("var(--color-skeleton-sheen)");
    expect(readFileSync(join(__dirname, "..", "..", "src/components/ui/skeleton.tsx"), "utf8")).not.toMatch(/rgba?\(\s*\d/);
  });

  it("is hidden from screen readers", () => {
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("LoadingRegion", () => {
  it("is busy and says what is loading while busy", () => {
    const html = renderToStaticMarkup(createElement(LoadingRegion, { label: "positions", busy: true }, "x"));
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<p class="sr-only" role="status">Loading positions<\/p>/);
  });

  it("keeps the status line mounted and empty once loaded", () => {
    const html = renderToStaticMarkup(createElement(LoadingRegion, { label: "positions", busy: false }, "x"));
    expect(html).not.toContain("aria-busy");
    expect(html).toMatch(/<p class="sr-only" role="status"><\/p>/);
  });
});

describe("LiveRegion", () => {
  it("is a status by default and an alert when assertive", () => {
    expect(renderToStaticMarkup(createElement(LiveRegion, { message: "Saved" }))).toContain('role="status"');
    expect(renderToStaticMarkup(createElement(LiveRegion, { message: "Failed", assertive: true }))).toContain('role="alert"');
  });
});
