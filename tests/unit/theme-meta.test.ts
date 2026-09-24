/**
 * The browser-chrome colour (meta theme-color, the PWA manifest and
 * THEME_META.pwaColor) matches each theme's page background.
 *
 * These are hex copies of an OKLCH token, because theme-color and the
 * manifest do not take oklch(). They drifted once already: the tokens
 * moved and the status bar kept the old background.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { THEME_META, type Theme } from "@/components/theme-provider";
import { toHex } from "@/lib/color-contrast";

const root = join(__dirname, "..", "..");
const CSS = readFileSync(join(root, "src", "app", "globals.css"), "utf8");

function bgPrimary(opener: RegExp): string {
  const m = opener.exec(CSS);
  if (!m) throw new Error(`block not found: ${opener}`);
  const body = CSS.slice(m.index, CSS.indexOf("}", m.index));
  const v = /--color-bg-primary:\s*([^;]+);/.exec(body);
  if (!v) throw new Error(`no --color-bg-primary in ${opener}`);
  return toHex(v[1]);
}

const EXPECTED: Record<Theme, string> = {
  light: bgPrimary(/@theme\s*\{/),
  dark: bgPrimary(/^\s*html\.dark\s*\{/m),
  coral: bgPrimary(/^\s*html\.coral\s*\{/m),
  "light-blue": bgPrimary(/^\s*html\.light-blue\s*\{/m),
  gray: bgPrimary(/^\s*html\.gray\s*\{/m),
};

describe("browser-chrome colour", () => {
  it.each(Object.keys(EXPECTED) as Theme[])("THEME_META.%s.pwaColor is the page background", (theme) => {
    expect(THEME_META[theme].pwaColor).toBe(EXPECTED[theme]);
  });

  it("the server-rendered meta theme-color is the dark default's background", () => {
    const layout = readFileSync(join(root, "src", "app", "layout.tsx"), "utf8");
    expect(layout).toContain(`<meta name="theme-color" content="${EXPECTED.dark}" />`);
  });

  it("the manifest uses the dark default's background", () => {
    const manifest = JSON.parse(readFileSync(join(root, "public", "manifest.json"), "utf8"));
    expect(manifest.theme_color).toBe(EXPECTED.dark);
    expect(manifest.background_color).toBe(EXPECTED.dark);
  });
});
