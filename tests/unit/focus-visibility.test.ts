/**
 * Keyboard focus is visible on the shared form primitives, including in
 * forced-colours mode (WP14, finding #19).
 *
 * Input, Select, Textarea and SearchInput used `focus:outline-none` with a
 * border colour change and a 30%-alpha 1px ring. Tailwind v4's
 * `outline-none` sets `outline-style: none`, and forced colours drop the
 * box-shadow ring, so a focused price or quantity field showed nothing in
 * Windows High Contrast. `outline-hidden` keeps a transparent outline that
 * forced colours repaint.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";

/** Class tokens of the first `tag` element in the markup. */
function classesOf(html: string, tag: string): string[] {
  const m = new RegExp(`<${tag}\\b[^>]*class="([^"]*)"`).exec(html);
  if (!m) throw new Error(`no <${tag}> with a class in: ${html}`);
  return m[1].split(/\s+/).filter(Boolean);
}

const noop = () => {};

const PRIMITIVES: [string, string, string][] = [
  ["Input", renderToStaticMarkup(createElement(Input, { label: "Price" })), "input"],
  ["Textarea", renderToStaticMarkup(createElement(Textarea, { label: "Notes" })), "textarea"],
  ["SearchInput", renderToStaticMarkup(createElement(SearchInput, { onSearch: noop })), "input"],
  ["Select", renderToStaticMarkup(createElement(Select, { label: "Side", options: [{ value: "buy", label: "Buy" }] })), "button"],
];

describe.each(PRIMITIVES)("%s", (_name, html, tag) => {
  const classes = classesOf(html, tag);

  it("does not remove the outline outright", () => {
    expect(classes.filter((c) => c.endsWith("outline-none"))).toEqual([]);
    expect(classes).toContain("outline-hidden");
  });

  it("draws a full-strength 2px ring on keyboard focus", () => {
    expect(classes).toContain("focus-visible:ring-2");
    expect(classes).toContain("focus-visible:ring-accent");
    expect(classes.some((c) => c.includes("ring-accent/"))).toBe(false);
  });
});

describe("Input in error state", () => {
  it("rings in the error colour, not the accent", () => {
    const classes = classesOf(renderToStaticMarkup(createElement(Input, { label: "Qty", error: "Too many" })), "input");
    expect(classes).toContain("focus-visible:ring-bearish");
    expect(classes).not.toContain("focus-visible:ring-accent");
  });
});

describe("Button", () => {
  it("keeps a transparent outline under its ring", () => {
    const classes = classesOf(renderToStaticMarkup(createElement(Button, null, "Go")), "button");
    expect(classes.filter((c) => c.endsWith("outline-none"))).toEqual([]);
    expect(classes).toContain("focus-visible:outline-hidden");
  });
});

describe("globals.css", () => {
  const css = readFileSync(join(__dirname, "..", "..", "src", "app", "globals.css"), "utf8");

  it("gives every focusable element a default focus-visible outline", () => {
    expect(css).toMatch(/:focus-visible\s*\{\s*outline:\s*2px solid var\(--color-focus\)/);
    expect(css).toMatch(/--color-focus:\s*var\(--color-accent\)/);
  });

  it("paints a system-colour outline in forced colours, outside any cascade layer", () => {
    const at = css.indexOf("@media (forced-colors: active)");
    expect(at).toBeGreaterThan(-1);
    // Unlayered: every @layer block opened before it has closed. Count
    // braces from the start of the file up to the media query.
    const before = css.slice(0, at).replace(/\/\*[\s\S]*?\*\//g, "");
    const depth = [...before].reduce((d, ch) => d + (ch === "{" ? 1 : ch === "}" ? -1 : 0), 0);
    expect(depth).toBe(0);
    expect(css.slice(at, at + 400)).toMatch(/:focus-visible\s*\{\s*outline:\s*2px solid Highlight/);
  });
});
