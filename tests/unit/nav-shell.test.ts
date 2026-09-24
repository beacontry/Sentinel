/**
 * The app and public shells (redesign plan, Stage 2 and finding 7):
 * a skip link to #main, the active nav item marked with aria-current,
 * and touch-sized mobile controls.
 *
 * The shells need the tier, AI and router contexts to render, so these
 * read the source.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(__dirname, "..", "..", f), "utf8");

describe.each([
  ["src/components/layout/top-nav-shell.tsx"],
  ["src/components/layout/public-shell.tsx"],
])("%s", (file) => {
  const src = read(file);

  it("renders a skip link to #main before anything else focusable", () => {
    const skip = src.indexOf('<a href="#main" className="skip-link">');
    expect(skip).toBeGreaterThan(-1);
    const firstButton = src.indexOf("<button");
    const firstLink = src.indexOf("<Link");
    expect(skip).toBeLessThan(firstButton);
    expect(skip).toBeLessThan(firstLink);
  });

  it("gives <main> the id the skip link targets, focusable by script only", () => {
    expect(src).toMatch(/<main id="main" tabIndex=\{-1\}/);
  });

  it("marks the current page with aria-current", () => {
    expect(src).toContain('aria-current={');
  });

  it("has a 44px menu button that says whether the menu is open", () => {
    expect(src).toMatch(/h-11 w-11[^"]*"[\s\S]{0,200}aria-expanded=\{/);
  });
});

describe("top-nav-shell.tsx", () => {
  const src = read("src/components/layout/top-nav-shell.tsx");

  it("styles the current link from aria-current, not a parallel ternary", () => {
    expect(src).not.toMatch(/active\s*\?\s*"text-text-primary bg-bg-hover font-medium"/);
    expect(src).toContain("aria-[current=page]:bg-bg-hover");
  });

  it("gives drawer rows a 44px target", () => {
    expect(src).toMatch(/const DRAWER_ITEM =\s*"flex min-h-11/);
  });

  it("keeps the hamburger below the safe-area inset", () => {
    expect(src).toContain("top-[calc(env(safe-area-inset-top)+12px)]");
  });

  it("paints <main> from a class, not an inline style", () => {
    expect(src).not.toContain('backgroundColor: "var(--color-bg-primary)"');
  });
});
