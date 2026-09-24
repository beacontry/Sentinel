#!/usr/bin/env node
/**
 * Style ratchet: counts of the class patterns the design system is moving
 * away from, which may only go down.
 *
 *   npm run lint:style             check against the committed baseline
 *   node scripts/style-ratchet.mjs --update   write the current (lower) counts
 *
 * A flat ban cannot land on an existing codebase, so each pattern has a
 * committed count in scripts/style-ratchet.baseline.json. The check fails
 * when any count is above its baseline, and prints the lower figure when
 * one has dropped so the smaller baseline can be committed with the fix.
 * --update refuses to raise a number.
 *
 * Patterns marked `zero` are hard rules, not ratchets: sizes, radii and
 * shadows that no longer exist in the theme. After the namespace reset in
 * globals.css, a `text-3xl` or `rounded-2xl` compiles to nothing and the
 * element silently falls back to an inherited value, so any use is a bug.
 *
 * Extra arguments (lint-staged passes file names) are ignored: the counts
 * are always over the whole of src/.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const BASELINE = path.join(ROOT, "scripts", "style-ratchet.baseline.json");

/**
 * Occurrences, not lines. Each regex runs over every src/**\/*.{ts,tsx}
 * file: Tailwind scans .ts too, and class maps such as src/lib/status-tone.ts
 * live there, so a .tsx-only walk let an off-scale class in through them.
 */
export const PATTERNS = {
  "text-[8-11px]": { re: /(?<![\w-])(?:[a-z0-9-]+:)*text-\[(?:[89]|1[01])px\]/g },
  "text-[arbitrary size]": { re: /(?<![\w-])(?:[a-z0-9-]+:)*text-\[(?:[\d.]+(?:px|rem|em)|clamp\([^\]]*\))\]/g },
  "rounded-[arbitrary]": { re: /(?<![\w-])(?:[a-z0-9-]+:)*rounded(?:-[trblse]{1,2})?-\[[^\]]+\]/g },
  "shadow-[arbitrary]": { re: /(?<![\w-])(?:[a-z0-9-]+:)*shadow-\[[^\]]+\]/g },
  "text-white": { re: /(?<![\w-])(?:[a-z0-9-]+:)*text-white(?![\w-])/g },
  "transition-all": { re: /(?<![\w-])transition-all(?![\w-])/g },
  "focus(-visible):outline-none": { re: /focus(?:-visible)?:outline-none/g },
  "outline-none without focus-visible ring": { custom: "outlineWithoutRing" },
  "raw <button": { re: /<button\b/g },
  "backdrop-blur": { re: /backdrop-blur/g },
  "-[#hex]": { re: /-\[#[0-9a-fA-F]{3,8}\]/g },
  "rgb()/rgba() literal": { re: /\brgba?\(\s*\d/g },
  "bg-white/ or bg-black/": { re: /(?<![\w-])(?:[a-z0-9-]+:)*bg-(?:white|black)\/[\d.[\]]+/g },
  // State colour through alpha instead of the -fill/-fg/-line triplet
  // (src/lib/status-tone.ts). Solid bars at /60-/90 count too: each is a
  // shade no theme or contrast test controls.
  "state colour alpha tint": { re: /(?<![\w-])(?:[a-z0-9-]+:)*(?:bg|border|text|ring)-(?:bullish|bearish|warning)\/[\d.]+/g },
  "border-l-2/4 stripe": { re: /(?<![\w-])(?:[a-z0-9-]+:)*border-l-(?:2|4)(?![\w-])/g },
  "inline fontSize 8-11": { re: /fontSize:\s*(?:["'`](?:[89]|1[01])px["'`]|(?:[89]|1[01])\b)/g },
  "text-3xl and up (off scale)": { re: /(?<![\w-])(?:[a-z0-9-]+:)*text-(?:3xl|4xl|5xl|6xl|7xl|8xl|9xl)(?![\w-])/g, zero: true },
  "rounded-xs/sm/2xl/3xl/4xl (off scale)": { re: /(?<![\w-])(?:[a-z0-9-]+:)*rounded(?:-[trblse]{1,2})?-(?:xs|sm|2xl|3xl|4xl)(?![\w-])/g, zero: true },
  "stock shadow-sm/md/lg/xl/2xl (off scale)": { re: /(?<![\w-])(?:[a-z0-9-]+:)*shadow-(?:2xs|xs|sm|md|lg|xl|2xl)(?![\w/-])/g, zero: true },
  // A solid accent fill labelled with a fixed colour instead of on-accent.
  // The accent's lightness differs per theme (dark on light themes, light
  // on dark ones), so black, white or a page background passes in some
  // themes and fails in others. on-accent is the one label measured
  // against the fill in every theme.
  "accent fill with a literal label": { custom: "accentFillLiteralLabel", zero: true },
};

const CUSTOM = {
  /** Class strings that remove the outline without drawing a focus-visible ring. */
  outlineWithoutRing(src) {
    let n = 0;
    for (const m of src.matchAll(/(["'`])((?:(?!\1)[\s\S])*?\boutline-none\b(?:(?!\1)[\s\S])*?)\1/g)) {
      if (!/focus-visible:(?:outline|ring)/.test(m[2]) && !/focus-within:(?:outline|ring)/.test(m[2])) n++;
    }
    return n;
  },
  /** Class strings with a solid bg-accent / bg-ld-accent fill and a text-black, text-white or text-bg-* label. */
  accentFillLiteralLabel(src) {
    let n = 0;
    for (const m of src.matchAll(/(["'`])((?:(?!\1)[\s\S])*?)\1/g)) {
      if (!/(?<![\w-])(?:[a-z0-9-]+:)*bg-(?:ld-)?accent(?:-hover|-dim)?(?![\w/-])/.test(m[2])) continue;
      n += m[2].match(/(?<![\w-])(?:[a-z0-9-]+:)*text-(?:black|white|bg-[\w-]+|ld-(?:deep|panel|card))(?![\w/-])/g)?.length ?? 0;
    }
    return n;
  },
};

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(ent.name) && !ent.name.endsWith(".d.ts")) acc.push(p);
  }
  return acc;
}

export { walk };

export function count(sources) {
  const out = {};
  for (const [name, p] of Object.entries(PATTERNS)) {
    out[name] = sources.reduce(
      (n, src) => n + (p.custom ? CUSTOM[p.custom](src) : (src.match(p.re)?.length ?? 0)),
      0,
    );
  }
  return out;
}

function main() {
  const update = process.argv.includes("--update");
  const sources = walk(path.join(ROOT, "src")).map((f) => fs.readFileSync(f, "utf8"));
  const now = count(sources);
  const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : {};

  const over = [];
  const lower = [];
  for (const [name, n] of Object.entries(now)) {
    // A zero rule holds at 0 once its baseline entry is gone; until then
    // (before the codemod clears it) it ratchets like the rest.
    const limit = PATTERNS[name].zero && base[name] === undefined ? 0 : base[name];
    const flag = limit === undefined ? "new" : n > limit ? "OVER" : n < limit ? "lower" : "";
    console.log(`${String(n).padStart(5)} / ${String(limit ?? "-").padStart(5)}  ${name}${flag ? `  (${flag})` : ""}`);
    if (limit !== undefined && n > limit) over.push(name);
    if (limit !== undefined && n < limit) lower.push(name);
  }

  if (update) {
    const next = {};
    for (const [name, n] of Object.entries(now)) {
      const limit = PATTERNS[name].zero && base[name] === undefined ? 0 : base[name];
      if (limit !== undefined && n > limit) {
        console.error(`refusing to raise "${name}" from ${limit} to ${n}`);
        process.exit(1);
      }
      if (PATTERNS[name].zero && n === 0) continue; // now a hard rule
      next[name] = n;
    }
    fs.writeFileSync(BASELINE, JSON.stringify(next, null, 2) + "\n");
    console.log(`wrote ${path.relative(ROOT, BASELINE)}`);
    return;
  }

  if (over.length) {
    console.error(`\nstyle ratchet: ${over.length} pattern(s) above baseline: ${over.join(", ")}`);
    console.error("Use the design tokens instead (see src/app/globals.css and docs/design/redesign-plan.md).");
    process.exit(1);
  }
  if (lower.length) {
    console.log(`\n${lower.length} count(s) dropped. Lock them in: node scripts/style-ratchet.mjs --update`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
  main();
}
