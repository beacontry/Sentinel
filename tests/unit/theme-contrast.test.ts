/**
 * WCAG contrast of the colour-token pairs that carry meaning, in all five
 * themes, computed from the values in src/app/globals.css (WP14).
 *
 * The light theme is the @theme block. dark, coral, light-blue and gray
 * are `html.<name>` blocks that override it, so each is resolved as the
 * @theme values with that block's declarations on top.
 *
 * - A label on an accent fill (primary Button, landing CTAs) must clear
 *   4.5:1 on the fill at rest and on its hover fill. White on #10b981 was
 *   2.5:1 (finding #18).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CSS = readFileSync(join(__dirname, "..", "..", "src", "app", "globals.css"), "utf8");

/** Declarations of the first block whose opening line matches `opener`. */
function block(opener: RegExp): Record<string, string> {
  const m = opener.exec(CSS);
  if (!m) throw new Error(`block not found: ${opener}`);
  const start = m.index + m[0].length;
  const end = CSS.indexOf("}", start);
  const vars: Record<string, string> = {};
  const body = CSS.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "");
  for (const d of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim();
  return vars;
}

const base = block(/@theme\s*\{/);
const THEMES: Record<string, Record<string, string>> = {
  light: base,
  dark: { ...base, ...block(/^\s*html\.dark\s*\{/m) },
  coral: { ...base, ...block(/^\s*html\.coral\s*\{/m) },
  "light-blue": { ...base, ...block(/^\s*html\.light-blue\s*\{/m) },
  gray: { ...base, ...block(/^\s*html\.gray\s*\{/m) },
};

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function token(theme: string, name: string): string {
  const v = THEMES[theme][name];
  if (!v) throw new Error(`${theme} has no ${name}`);
  return v;
}

describe("contrast helper", () => {
  it("matches the published WCAG figures", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#10b981")).toBeCloseTo(2.54, 2);
  });
});

describe.each(Object.keys(THEMES))("%s theme", (theme) => {
  it.each([
    ["--color-on-accent", "--color-accent"],
    ["--color-on-accent", "--color-accent-hover"],
    ["--color-ld-on-accent", "--color-ld-accent"],
    ["--color-ld-on-accent", "--color-ld-accent-dim"],
  ])("label %s on fill %s is at least 4.5:1", (label, fill) => {
    expect(contrast(token(theme, label), token(theme, fill))).toBeGreaterThanOrEqual(4.5);
  });
});
