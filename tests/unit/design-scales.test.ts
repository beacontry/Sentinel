/**
 * The type, radius and elevation scales in globals.css: seven font sizes
 * with a 12px floor, three radii, three elevations. The budget is the
 * point, so the test pins the count as well as the values.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CSS = readFileSync(join(__dirname, "..", "..", "src", "app", "globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const theme = (() => {
  const start = CSS.indexOf("@theme {");
  return CSS.slice(start, CSS.indexOf("\n}", start));
})();

function decls(prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of theme.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (m[1].startsWith(prefix)) out[m[1]] = m[2].trim();
  }
  return out;
}

const px = (v: string) => (v.endsWith("rem") ? parseFloat(v) * 16 : parseFloat(v));

describe("type scale", () => {
  const sizes = Object.fromEntries(
    Object.entries(decls("--text-")).filter(([k]) => !k.includes("--line-height") && k !== "--text-*"),
  );

  it("has exactly seven steps", () => {
    expect(Object.keys(sizes)).toEqual([
      "--text-xs",
      "--text-sm",
      "--text-base",
      "--text-lg",
      "--text-xl",
      "--text-2xl",
      "--text-display",
    ]);
  });

  it("never goes below 12px, and the app steps are fixed rem", () => {
    for (const [name, v] of Object.entries(sizes)) {
      if (name === "--text-display") continue;
      expect(v, name).toMatch(/^[\d.]+rem$/);
      expect(px(v), name).toBeGreaterThanOrEqual(12);
    }
  });

  it("puts the floor inside the marketing clamp()", () => {
    expect(sizes["--text-display"]).toMatch(/^clamp\(2\.5rem,/);
  });

  it("gives every step a line height", () => {
    for (const name of Object.keys(sizes)) {
      expect(decls(`${name}--line-height`)[`${name}--line-height`], name).toBeDefined();
    }
  });
});

describe("radius and elevation", () => {
  it("defines three radii", () => {
    const r = decls("--radius-");
    delete r["--radius-*"];
    expect(r).toEqual({ "--radius-md": "6px", "--radius-lg": "8px", "--radius-xl": "12px" });
  });

  it("defines three elevations, each routed through a per-theme variable", () => {
    const s = decls("--shadow-");
    delete s["--shadow-*"];
    expect(s).toEqual({
      "--shadow-card": "var(--elevation-card)",
      "--shadow-pop": "var(--elevation-pop)",
      "--shadow-modal": "var(--elevation-modal)",
    });
    for (const block of [/html\s*\{[^}]*\}/, /html\.dark\s*\{[^}]*\}/, /html\.gray\s*\{[^}]*\}/]) {
      const body = block.exec(CSS)?.[0] ?? "";
      for (const e of ["card", "pop", "modal"]) expect(body, `${block} --elevation-${e}`).toContain(`--elevation-${e}:`);
    }
  });
});

describe("eyebrow utility", () => {
  it("is 12px, uppercase in CSS, tracked in em", () => {
    const m = /@utility eyebrow\s*\{([^}]*)\}/.exec(CSS);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("font-size: var(--text-xs)");
    expect(m![1]).toContain("text-transform: uppercase");
    expect(m![1]).toMatch(/letter-spacing:\s*0\.08em/);
  });
});
