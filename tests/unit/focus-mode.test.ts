/**
 * The Analysis page's Focus mode button toggles `html.focus-mode`, and the
 * globals.css rule it drives must name an element the shell renders.
 *
 * It named aside[data-app-sidebar] after the shell had moved to a top bar,
 * so the button toggled a class that hid nothing.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "src");
const css = readFileSync(join(root, "app", "globals.css"), "utf8");
const shell = readFileSync(join(root, "components", "layout", "top-nav-shell.tsx"), "utf8");

describe("focus mode", () => {
  it("hides an element that carries the attribute the rule selects on", () => {
    const m = /html\.focus-mode\s+(\w+)\[([\w-]+)\]\s*\{/.exec(css);
    expect(m).not.toBeNull();
    const [, tag, attr] = m!;
    expect(shell).toMatch(new RegExp(`<${tag}\\s[^>]*\\b${attr}\\b`));
  });
});
