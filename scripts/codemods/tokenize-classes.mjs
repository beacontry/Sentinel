#!/usr/bin/env node
/**
 * Rewrite ad-hoc Tailwind classes onto the design tokens in globals.css.
 *
 *   node scripts/codemods/tokenize-classes.mjs <family> [--dry | --write]
 *
 * Families (run and commit one at a time, so each diff can be reviewed and
 * reverted on its own):
 *
 *   text        arbitrary and off-scale font sizes → the 7-step type scale
 *   radius      arbitrary and off-scale radii → rounded-md / lg / xl
 *   shadow      Tailwind's stock shadows → shadow-card / pop / modal
 *   transition  transition-all → the properties that actually change
 *   state       bg-X/NN + text-X chips and banners → the X-fill / X-fg /
 *               X-line triplet (X = bullish, bearish, warning)
 *   on-accent   text-white on a solid accent fill → text-on-accent
 *
 * Only string and template literals in src/**\/*.{ts,tsx} are touched;
 * comments and JSX text are left alone. --dry (the default) prints per-file
 * counts and the sites left for a person to decide; --write applies.
 *
 * Every rule here is mechanical. Anything that needs judgement is listed
 * under "review by hand" and not rewritten:
 *   - text-[clamp(...)] marketing headings
 *   - rounded-[2px] / [3px]
 *   - shadow-[...] arbitrary shadows
 *   - transition-all on a class string with no state variant, which is
 *     usually animating a width or height driven from style={}
 *   - text-white that does not sit on a solid accent fill
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..");
const SRC = path.join(ROOT, "src");

// ── rules ────────────────────────────────────────────────────────────────

/** Utility prefix: optional variants (`sm:`, `hover:`, `group-hover:` …). */
const V = String.raw`((?:[a-z0-9-]+:)*)`;

const TEXT_XS = ["8px", "9px", "10px", "11px", "12px", "0.7rem", "0.72rem", "0.75rem", "0.78rem", "0.8rem"];
const TEXT_SM = ["13px", "14px", "0.82rem", "0.84rem", "0.85rem", "0.86rem", "0.875rem", "0.88rem"];
const TEXT_BASE = ["15px", "16px", "0.9rem", "0.92rem", "0.93rem", "0.94rem", "0.95rem", "0.98rem", "1rem", "1.04rem", "1.05rem"];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const alt = (xs) => xs.map(esc).join("|");

const FAMILIES = {
  text: {
    rules: [
      [new RegExp(String.raw`(?<![\w-])${V}text-\[(?:${alt(TEXT_XS)})\]`, "g"), "$1text-xs"],
      [new RegExp(String.raw`(?<![\w-])${V}text-\[(?:${alt(TEXT_SM)})\]`, "g"), "$1text-sm"],
      [new RegExp(String.raw`(?<![\w-])${V}text-\[(?:${alt(TEXT_BASE)})\]`, "g"), "$1text-base"],
      [new RegExp(String.raw`(?<![\w-])${V}text-\[(?:1\.25rem|20px)\]`, "g"), "$1text-lg"],
      [new RegExp(String.raw`(?<![\w-])${V}text-\[(?:1\.5rem|24px)\]`, "g"), "$1text-xl"],
      [new RegExp(String.raw`(?<![\w-])${V}text-(?:\[(?:2rem|2\.5rem|32px)\]|3xl|4xl)(?![\w-])`, "g"), "$1text-2xl"],
      [new RegExp(String.raw`(?<![\w-])${V}text-(?:5xl|6xl|7xl)(?![\w-])`, "g"), "$1text-display"],
    ],
    review: [/text-\[(?:[\d.]+(?:px|rem|em)|clamp\([^\]]*\))\]/g],
  },
  radius: {
    rules: [
      [new RegExp(String.raw`(?<![\w-])${V}rounded(-[trblse]{1,2})?-\[(?:8px|10px|0\.5rem|0\.625rem)\]`, "g"), "$1rounded$2-lg"],
      [new RegExp(String.raw`(?<![\w-])${V}rounded(-[trblse]{1,2})?-(?:\[(?:12px|14px|16px|18px|0\.75rem|1rem)\]|2xl|3xl)(?![\w-])`, "g"), "$1rounded$2-xl"],
      // rounded-sm was 4px, the same as bare `rounded`, which stays.
      [new RegExp(String.raw`(?<![\w-])${V}rounded(-[trblse]{1,2})?-(?:sm|xs)(?![\w-])`, "g"), "$1rounded$2"],
    ],
    review: [/rounded(?:-[trblse]{1,2})?-\[[^\]]+\]/g],
  },
  shadow: {
    rules: [
      [new RegExp(String.raw`(?<![\w-])${V}shadow-(?:xs|sm|md)(?![\w/-])`, "g"), "$1shadow-card"],
      [new RegExp(String.raw`(?<![\w-])${V}shadow-(?:lg|xl)(?![\w/-])`, "g"), "$1shadow-pop"],
      [new RegExp(String.raw`(?<![\w-])${V}shadow-2xl(?![\w/-])`, "g"), "$1shadow-modal"],
      [new RegExp(String.raw`(?<![\w-])${V}shadow(?![\w/:\[-])`, "g"), "$1shadow-card"],
    ],
    review: [/shadow-\[[^\]]+\]/g, /shadow-(?:black|white)\/\d+/g],
  },
  transition: {
    // Handled per string in rewriteTransition(): the replacement depends on
    // what else the class string changes.
    rules: [],
    review: [],
  },
  state: {
    rules: ["bullish", "bearish", "warning"].flatMap((x) => [
      // Edge + tint, either order.
      [new RegExp(String.raw`(?<![\w:-])border-${x}/\d+(\s+)bg-${x}/(?:5|8|10|12|15|20)(?![\w-])`, "g"), `border-${x}-line$1bg-${x}-fill`],
      [new RegExp(String.raw`(?<![\w:-])bg-${x}/(?:5|8|10|12|15|20)(\s+)border-${x}/\d+(?![\w-])`, "g"), `bg-${x}-fill$1border-${x}-line`],
      // Tint + state text, either order (after the edge rule, so a triple
      // becomes line + fill + fg).
      [new RegExp(String.raw`(?<![\w:-])bg-${x}(?:/(?:5|8|10|12|15|20)|-fill)(\s+)text-${x}(?![\w/-])`, "g"), `bg-${x}-fill$1text-${x}-fg`],
      [new RegExp(String.raw`(?<![\w:-])text-${x}(\s+)bg-${x}(?:/(?:5|8|10|12|15|20)|-fill)(?![\w/-])`, "g"), `text-${x}-fg$1bg-${x}-fill`],
    ]),
    review: [],
  },
  "on-accent": {
    rules: [],
    review: [],
  },
};

const TRANSFORM = /(?:^|[\s:])-?(?:translate-|scale-|rotate-|skew-)/;
const OPACITY = /(?:^|[\s:])opacity-/;
const SHADOW = /(?:^|[\s:])shadow(?:-|\s|$)/;
const STATEFUL = /(?:^|\s)(?:[a-z0-9-]+:)*(?:hover|focus|focus-visible|focus-within|active|group-hover|peer-hover|aria-[a-z]+|data-[a-z-]+|open|disabled|enabled|group-focus|peer-checked|checked):/;

function rewriteTransition(str, review) {
  if (!/(?<![\w-])transition-all(?![\w-])/.test(str)) return [str, 0];
  if (!STATEFUL.test(str) && !/\$\{/.test(str)) {
    review.push("transition-all with no state variant: " + str.trim().slice(0, 90));
    return [str, 0];
  }
  const props = ["background-color", "border-color", "color"];
  if (TRANSFORM.test(str)) props.push("transform");
  if (OPACITY.test(str)) props.push("opacity");
  if (SHADOW.test(str)) props.push("box-shadow");
  const repl = props.length === 3 ? "transition-colors" : `transition-[${props.join(",")}]`;
  let n = 0;
  const out = str.replace(/(?<![\w-])transition-all(?![\w-])/g, () => {
    n++;
    return repl;
  });
  return [out, n];
}

const ACCENT_FILL = /(?<![\w:/-])bg-(?:ld-)?accent(?![\w/-])/;

function rewriteOnAccent(str, review) {
  if (!/(?<![\w:-])text-white(?![\w/-])/.test(str)) return [str, 0];
  if (!ACCENT_FILL.test(str)) {
    review.push("text-white not on a solid accent fill: " + str.trim().slice(0, 90));
    return [str, 0];
  }
  const label = /(?<![\w:/-])bg-ld-accent(?![\w/-])/.test(str) ? "text-ld-on-accent" : "text-on-accent";
  let n = 0;
  const out = str.replace(/(?<![\w:-])text-white(?![\w/-])/g, () => {
    n++;
    return label;
  });
  return [out, n];
}

// ── literal scanner ──────────────────────────────────────────────────────

/** [start, end) spans of every string and template literal, skipping comments. */
export function literalSpans(src) {
  const spans = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      i = src.indexOf("\n", i);
      if (i < 0) break;
      continue;
    }
    if (c === "/" && d === "*") {
      const e = src.indexOf("*/", i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const start = i;
      i++;
      while (i < n && src[i] !== c) {
        if (src[i] === "\\") i++;
        else if (c !== "`" && src[i] === "\n") break; // not a string (JSX text apostrophe)
        i++;
      }
      if (i < n && src[i] === c) spans.push([start, i + 1]);
      else i = start; // unterminated: treat the quote as plain text
      i++;
      continue;
    }
    i++;
  }
  return spans;
}

export function transform(src, family) {
  const fam = FAMILIES[family];
  const review = [];
  let count = 0;
  let out = "";
  let last = 0;
  for (const [s, e] of literalSpans(src)) {
    let lit = src.slice(s, e);
    for (const [re, repl] of fam.rules) {
      lit = lit.replace(re, (...m) => {
        count++;
        return repl.replace(/\$(\d)/g, (_, k) => m[Number(k)] ?? "");
      });
    }
    if (family === "transition") {
      const [t, k] = rewriteTransition(lit, review);
      lit = t;
      count += k;
    }
    if (family === "on-accent") {
      const [t, k] = rewriteOnAccent(lit, review);
      lit = t;
      count += k;
    }
    for (const re of fam.review) for (const m of lit.match(re) ?? []) review.push(m);
    out += src.slice(last, s) + lit;
    last = e;
  }
  out += src.slice(last);
  return { out, count, review };
}

// ── CLI ──────────────────────────────────────────────────────────────────

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(tsx|ts)$/.test(ent.name) && !ent.name.endsWith(".d.ts")) acc.push(p);
  }
  return acc;
}

function main() {
  const [family, mode = "--dry"] = process.argv.slice(2);
  if (!FAMILIES[family] || !["--dry", "--write"].includes(mode)) {
    console.error(`usage: tokenize-classes.mjs <${Object.keys(FAMILIES).join("|")}> [--dry|--write]`);
    process.exit(2);
  }
  let total = 0;
  const reviewAll = [];
  for (const file of walk(SRC)) {
    const src = fs.readFileSync(file, "utf8");
    const { out, count, review } = transform(src, family);
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    if (count) {
      total += count;
      console.log(`${String(count).padStart(4)}  ${rel}`);
      if (mode === "--write") fs.writeFileSync(file, out);
    }
    for (const r of review) reviewAll.push(`${rel}: ${r}`);
  }
  console.log(`${mode === "--write" ? "rewrote" : "would rewrite"} ${total} in family "${family}"`);
  if (reviewAll.length) {
    console.log(`\nreview by hand (${reviewAll.length}):`);
    for (const r of reviewAll) console.log("  " + r);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
  main();
}
