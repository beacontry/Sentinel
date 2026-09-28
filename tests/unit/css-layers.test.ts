/**
 * Every rule in globals.css sits in a cascade layer, apart from three
 * deliberate exceptions.
 *
 * Tailwind v4 puts its utilities in `@layer utilities`, and an unlayered
 * rule beats any layered one whatever its specificity. The animation
 * classes, the stagger delays and the landing grid used to be unlayered,
 * so `motion-reduce:animate-none` or an `opacity-*` utility on the same
 * element lost without a trace.
 *
 * The exceptions are unlayered on purpose: the forced-colours focus
 * outline (it has to beat every outline utility), the reduced-motion
 * blanket (it has to cover anything added later) and print.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CSS = readFileSync(join(__dirname, "..", "..", "src", "app", "globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** The prelude (text before `{` or `;`) of every top-level statement. */
function topLevelPreludes(): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of CSS) {
    if (depth === 0) {
      if (ch === "{") {
        out.push(buf.trim());
        buf = "";
        depth = 1;
      } else if (ch === ";") {
        out.push(buf.trim());
        buf = "";
      } else {
        buf += ch;
      }
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
    }
  }
  return out.filter(Boolean);
}

const ALLOWED = [
  /^@import\b/,
  /^@theme\b/,
  /^@layer\b/,
  /^@utility\b/,
  /^@custom-variant\b/,
  /^@media \(forced-colors: active\)$/,
  /^@media \(prefers-reduced-motion: reduce\)$/,
  /^@media print$/,
];

describe("globals.css cascade layers", () => {
  const preludes = topLevelPreludes();

  it("parses the file", () => {
    expect(preludes.length).toBeGreaterThan(3);
  });

  it("has no unlayered rule outside the three deliberate exceptions", () => {
    const stray = preludes.filter((p) => !ALLOWED.some((re) => re.test(p)));
    expect(stray).toEqual([]);
  });

  it("keeps the reduced-motion blanket after every layer", () => {
    const motion = preludes.findIndex((p) => p.startsWith("@media (prefers-reduced-motion"));
    const lastLayer = preludes.map((p) => p.startsWith("@layer")).lastIndexOf(true);
    expect(motion).toBeGreaterThan(lastLayer);
  });
});
