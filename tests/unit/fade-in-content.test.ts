/**
 * Content that fades in stays visible when animations are stripped (WP14,
 * finding #28).
 *
 * .animate-fade-in-up also declared a base `opacity: 0`, redundant with
 * the `both` fill mode that already holds the from-state during the delay.
 * Any user stylesheet or extension that forces `animation: none` left the
 * landing sections, the pricing page and every dashboard widget invisible.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CSS = readFileSync(join(__dirname, "..", "..", "src", "app", "globals.css"), "utf8");

/** Declarations of every rule whose selector is exactly `.animate-*`. */
function animateRules(): [string, string][] {
  return [...CSS.matchAll(/^(\.animate-[\w-]+)\s*\{([^}]*)\}/gm)].map((m) => [m[1], m[2]]);
}

describe("animation utility classes", () => {
  it("finds the classes", () => {
    expect(animateRules().map(([sel]) => sel)).toContain(".animate-fade-in-up");
  });

  it.each(animateRules())("%s does not hide the element outside its animation", (_sel, body) => {
    expect(body).not.toMatch(/(^|;)\s*opacity\s*:\s*0\s*(;|$)/);
    expect(body).not.toMatch(/visibility\s*:\s*hidden/);
  });
});
