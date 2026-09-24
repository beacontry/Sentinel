/**
 * WCAG contrast of every colour-token pair that carries meaning, in all
 * five themes and in colour-blind mode on each, computed from the values
 * in src/app/globals.css.
 *
 * The light theme is the @theme block. dark, coral, light-blue and gray
 * are `html.<name>` blocks that override it, and colour-blind mode is
 * `html.colorblind` (light themes) or `html.colorblind.dark, .gray` on top
 * of that. The tokens are OKLCH; src/lib/color-contrast.ts converts them.
 *
 * - A label on an accent fill must clear 4.5:1 at rest and on hover.
 *   White on the old #10b981 was 2.5:1.
 * - Body text (primary, secondary, muted) must clear 4.5:1 on every
 *   surface it is placed on.
 * - A form control's edge must clear 3:1 (WCAG 1.4.11) on every surface.
 * - Gain and loss text must clear 4.5:1 on a card, and each chip's
 *   foreground must clear 4.5:1 on its own fill.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio, parseColor, toHex } from "@/lib/color-contrast";

const CSS = readFileSync(join(__dirname, "..", "..", "src", "app", "globals.css"), "utf8");

/** Declarations of the first block whose opening matches `opener`. */
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
const colorblindLight = block(/^\s*html\.colorblind\s*\{/m);
const colorblindDark = block(/^\s*html\.colorblind\.dark,\s*html\.colorblind\.gray\s*\{/m);

const THEMES: Record<string, Record<string, string>> = {
  light: base,
  dark: { ...base, ...block(/^\s*html\.dark\s*\{/m) },
  coral: { ...base, ...block(/^\s*html\.coral\s*\{/m) },
  "light-blue": { ...base, ...block(/^\s*html\.light-blue\s*\{/m) },
  gray: { ...base, ...block(/^\s*html\.gray\s*\{/m) },
};
const DARK = new Set(["dark", "gray"]);

const MODES: [string, Record<string, string>][] = Object.entries(THEMES).flatMap(([name, vars]) => [
  [name, vars] as [string, Record<string, string>],
  [`${name} + colour-blind`, { ...vars, ...(DARK.has(name) ? colorblindDark : colorblindLight) }],
]);

/** A token's value with var() references followed. */
function resolve(vars: Record<string, string>, name: string, depth = 0): string {
  const v = vars[name];
  if (!v) throw new Error(`no ${name}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref) {
    if (depth > 8) throw new Error(`var() loop at ${name}`);
    return resolve(vars, ref[1], depth + 1);
  }
  return v;
}

const SURFACES = ["--color-bg-primary", "--color-bg-secondary", "--color-bg-surface", "--color-bg-elevated"];
const TEXT_SURFACES = [...SURFACES, "--color-bg-hover"];

describe("contrast helper", () => {
  it("matches the published WCAG figures", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#10b981")).toBeCloseTo(2.54, 2);
  });
});

describe.each(MODES)("%s", (_mode, vars) => {
  const cr = (fg: string, bg: string) => contrastRatio(resolve(vars, fg), resolve(vars, bg));

  it.each([
    ["--color-on-accent", "--color-accent"],
    ["--color-on-accent", "--color-accent-hover"],
    ["--color-ld-on-accent", "--color-ld-accent"],
    ["--color-ld-on-accent", "--color-ld-accent-dim"],
    ["--color-on-bearish", "--color-bearish-solid"],
  ])("label %s on fill %s is at least 4.5:1", (label, fill) => {
    expect(cr(label, fill)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(
    ["--color-text-primary", "--color-text-secondary", "--color-text-muted"].flatMap((t) =>
      TEXT_SURFACES.map((s) => [t, s]),
    ),
  )("%s on %s is at least 4.5:1", (text, surface) => {
    expect(cr(text, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SURFACES)("control border is at least 3:1 on %s", (surface) => {
    expect(cr("--color-border-control", surface)).toBeGreaterThanOrEqual(3);
  });

  it.each(["--color-bullish", "--color-bearish", "--color-warning"])(
    "%s text is at least 4.5:1 on bg-secondary and bg-surface",
    (state) => {
      expect(cr(state, "--color-bg-secondary")).toBeGreaterThanOrEqual(4.5);
      expect(cr(state, "--color-bg-surface")).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(["bullish", "bearish", "warning"])("%s-fg is at least 4.5:1 on its -fill", (state) => {
    expect(cr(`--color-${state}-fg`, `--color-${state}-fill`)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["bullish", "bearish", "warning"])("%s-line is at least 3:1 on bg-secondary", (state) => {
    expect(cr(`--color-${state}-line`, "--color-bg-secondary")).toBeGreaterThanOrEqual(3);
  });
});

describe("colour-blind pair", () => {
  it.each(Object.keys(THEMES))("%s: gain is blue and loss is orange", (theme) => {
    const cb = { ...THEMES[theme], ...(DARK.has(theme) ? colorblindDark : colorblindLight) };
    const hue = (name: string) => Number(/oklch\([^)]*\s([\d.]+)\)$/.exec(resolve(cb, name))?.[1]);
    // Nothing in the green band (about 110-200) or the red one (under 40),
    // where a deuteranope loses the distinction.
    expect(hue("--color-bullish")).toBeGreaterThan(200);
    expect(hue("--color-bearish")).toBeGreaterThanOrEqual(40);
    expect(hue("--color-bearish")).toBeLessThan(110);
  });
});

describe("tokens parse", () => {
  it.each(Object.keys(THEMES))("every colour token in %s is a colour the helper can read", (theme) => {
    const vars = THEMES[theme];
    for (const name of Object.keys(vars)) {
      if (!name.startsWith("--color-")) continue;
      const v = resolve(vars, name);
      if (v.startsWith("color-mix(")) continue; // derived; its inputs are checked
      expect(() => parseColor(v), `${theme} ${name}: ${v}`).not.toThrow();
    }
  });

  it("the light page background converts to a hex for meta theme-color", () => {
    expect(toHex(resolve(THEMES.light, "--color-bg-primary"))).toMatch(/^#[0-9a-f]{6}$/);
  });
});
