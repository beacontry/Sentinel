/**
 * The class codemod and the style ratchet. Both run over the whole of src/,
 * so a wrong regex here rewrites or miscounts hundreds of sites at once.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { transform, literalSpans } from "../../scripts/codemods/tokenize-classes.mjs";
import { count as countRaw, walk as walkRaw } from "../../scripts/style-ratchet.mjs";

type Result = { out: string; count: number; review: string[] };
const run = (src: string, family: string): Result => transform(src, family);
const count = (sources: string[]): Record<string, number> => countRaw(sources) as Record<string, number>;

describe("tokenize-classes: literal scanner", () => {
  it("finds string and template literals and skips comments", () => {
    const src = `// text-[10px]\nconst a = "text-[10px]"; /* "text-[11px]" */ const b = \`x \${y} text-[9px]\`;`;
    const spans = (literalSpans(src) as [number, number][]).map(([s, e]) => src.slice(s, e));
    expect(spans).toEqual([`"text-[10px]"`, "`x ${y} text-[9px]`"]);
  });

  it("follows a double-quoted JSX attribute across lines", () => {
    const src = `<a className="flex text-[11px] uppercase\n  tracking-[0.08em] text-[10px]">x</a>`;
    expect(run(src, "text").out).toBe(`<a className="flex text-xs uppercase\n  tracking-[0.08em] text-xs">x</a>`);
  });

  it("skips a regex literal holding a quote or backtick, instead of opening a string", () => {
    const src = 'const t = s.replace(/[*_`]/g, "");\nconst c = "text-[10px]";';
    const spans = (literalSpans(src) as [number, number][]).map(([s, e]) => src.slice(s, e));
    expect(spans).toEqual([`""`, `"text-[10px]"`]);
  });

  it("does not take a division or a self-closing tag for a regex", () => {
    const src = 'const r = a / b; const q = "x"; <A b={c} /><p className="y" />';
    const spans = (literalSpans(src) as [number, number][]).map(([s, e]) => src.slice(s, e));
    expect(spans).toEqual([`"x"`, `"y"`]);
  });

  it("does not treat an apostrophe in JSX text as a string", () => {
    const src = `<p>Don't panic</p>\n<p className="text-[10px]">x</p>`;
    expect(run(src, "text").out).toBe(`<p>Don't panic</p>\n<p className="text-xs">x</p>`);
  });
});

describe("tokenize-classes: families", () => {
  it("text: maps sub-12px and in-between sizes onto the scale, keeping variants", () => {
    const r = run(`"text-[10px] sm:text-[13px] lg:text-[0.94rem] text-3xl md:text-5xl text-[1.25rem]"`, "text");
    expect(r.out).toBe(`"text-xs sm:text-sm lg:text-base text-2xl md:text-display text-lg"`);
    expect(r.count).toBe(6);
  });

  it("text: leaves colour utilities and clamp() headings alone, listing the clamps", () => {
    const r = run(`"text-text-secondary text-[clamp(2rem,5vw,3.4rem)] text-[var(--x)]"`, "text");
    expect(r.out).toBe(`"text-text-secondary text-[clamp(2rem,5vw,3.4rem)] text-[var(--x)]"`);
    expect(r.review).toEqual(["text-[clamp(2rem,5vw,3.4rem)]"]);
  });

  it("radius: maps arbitrary and off-scale radii, keeping the side", () => {
    const r = run(`"rounded-[10px] rounded-t-[14px] rounded-2xl rounded-sm rounded-[2px]"`, "radius");
    expect(r.out).toBe(`"rounded-lg rounded-t-xl rounded-xl rounded rounded-[2px]"`);
    expect(r.review).toEqual(["rounded-[2px]"]);
  });

  it("shadow: maps stock shadows and leaves shadow colours alone", () => {
    const r = run(`"shadow-sm hover:shadow-lg shadow-2xl shadow-black/30"`, "shadow");
    expect(r.out).toBe(`"shadow-card hover:shadow-pop shadow-modal shadow-black/30"`);
  });

  it("transition: names only what changes", () => {
    expect(run(`"transition-all hover:bg-bg-hover"`, "transition").out).toBe(`"transition-colors hover:bg-bg-hover"`);
    expect(run(`"transition-all hover:-translate-y-1 hover:shadow-pop"`, "transition").out).toBe(
      `"transition-[background-color,border-color,color,translate,box-shadow] hover:-translate-y-1 hover:shadow-pop"`,
    );
  });

  it("transition: names translate, scale and gap as v4 compiles them, not transform", () => {
    // Tailwind v4 writes hover:-translate-y-1 to the `translate` property and
    // active:scale-95 to `scale`; a list naming `transform` animates neither.
    expect(run(`"transition-all group-hover:translate-x-0.5"`, "transition").out).toBe(
      `"transition-[background-color,border-color,color,translate] group-hover:translate-x-0.5"`,
    );
    expect(run(`"transition-all active:scale-95 disabled:opacity-50"`, "transition").out).toBe(
      `"transition-[background-color,border-color,color,scale,opacity] active:scale-95 disabled:opacity-50"`,
    );
    expect(run(`"gap-1 group-hover:gap-2 transition-all"`, "transition").out).toBe(
      `"gap-1 group-hover:gap-2 transition-[background-color,border-color,color,gap]"`,
    );
    expect(run(`"transition-all hover:skew-x-3"`, "transition").out).toBe(
      `"transition-[background-color,border-color,color,transform] hover:skew-x-3"`,
    );
  });

  it("transition: re-derives a list an earlier run wrote, and leaves a correct one alone", () => {
    const old = run(`"transition-[background-color,border-color,color,transform] hover:-translate-y-0.5"`, "transition");
    expect(old.out).toBe(`"transition-[background-color,border-color,color,translate] hover:-translate-y-0.5"`);
    expect(old.count).toBe(1);
    const ok = `"transition-[background-color,border-color,color,translate] hover:-translate-y-0.5"`;
    expect(run(ok, "transition").count).toBe(0);
    expect(run(`"transition-[width,background-color] h-full"`, "transition").count).toBe(0);
  });

  it("transition: keeps a bar fill's length animation, named", () => {
    expect(run("`h-full rounded-full transition-all ${ok ? \"bg-bullish\" : \"bg-bearish\"}`", "transition").out).toBe(
      "`h-full rounded-full transition-[width,background-color] ${ok ? \"bg-bullish\" : \"bg-bearish\"}`",
    );
    expect(run(`"w-full rounded transition-all"`, "transition").out).toBe(`"w-full rounded transition-[height,background-color]"`);
  });

  it("transition: leaves a stateless transition-all for review (likely a width animation)", () => {
    const r = run(`"h-2 rounded-full bg-accent transition-all duration-500"`, "transition");
    expect(r.out).toBe(`"h-2 rounded-full bg-accent transition-all duration-500"`);
    expect(r.review).toHaveLength(1);
  });

  it("state: turns a tinted chip into the triplet", () => {
    expect(run(`"border-bullish/20 bg-bullish/10 text-bullish"`, "state").out).toBe(
      `"border-bullish-line bg-bullish-fill text-bullish-fg"`,
    );
    expect(run(`"bg-bearish/10 text-bearish"`, "state").out).toBe(`"bg-bearish-fill text-bearish-fg"`);
    expect(run(`"border-warning/30 bg-warning/10 p-4"`, "state").out).toBe(`"border-warning-line bg-warning-fill p-4"`);
  });

  it("state: leaves hover tints and solid fills alone", () => {
    const src = `"hover:bg-bullish/10 text-bullish bg-bearish/60"`;
    expect(run(src, "state").out).toBe(src);
  });

  it("on-accent: rewrites text-white only on a solid accent fill", () => {
    expect(run(`"bg-accent text-white"`, "on-accent").out).toBe(`"bg-accent text-on-accent"`);
    expect(run(`"bg-ld-accent text-white"`, "on-accent").out).toBe(`"bg-ld-accent text-ld-on-accent"`);
    const other = run(`"bg-bearish text-white"`, "on-accent");
    expect(other.out).toBe(`"bg-bearish text-white"`);
    expect(other.review).toHaveLength(1);
  });
});

describe("style-ratchet: counts", () => {
  it("counts occurrences, with variants", () => {
    const c = count([`"text-[10px] sm:text-[11px] text-[12px] rounded-2xl shadow-lg transition-all"`]);
    expect(c["text-[8-11px]"]).toBe(2);
    expect(c["text-[arbitrary size]"]).toBe(3);
    expect(c["rounded-xs/sm/2xl/3xl/4xl (off scale)"]).toBe(1);
    expect(c["stock shadow-sm/md/lg/xl/2xl (off scale)"]).toBe(1);
    expect(c["transition-all"]).toBe(1);
  });

  it("does not count the scale's own names or colour modifiers", () => {
    const c = count([`"text-2xl text-display rounded-xl shadow-card shadow-pop shadow-black/30 text-text-primary"`]);
    expect(c["text-3xl and up (off scale)"]).toBe(0);
    expect(c["rounded-xs/sm/2xl/3xl/4xl (off scale)"]).toBe(0);
    expect(c["stock shadow-sm/md/lg/xl/2xl (off scale)"]).toBe(0);
  });

  it("flags outline-none only when the same class string draws no focus-visible ring", () => {
    const c = count([`"outline-none" "outline-none focus-visible:ring-2" "focus-visible:outline-none"`]);
    expect(c["outline-none without focus-visible ring"]).toBe(1);
  });

  it("flags a solid accent fill labelled with a fixed colour, not on-accent", () => {
    const c = count([
      `"bg-accent text-black" "hover:bg-accent-hover text-bg-primary" "bg-ld-accent text-white"`,
      `"bg-accent text-on-accent" "bg-ld-accent text-ld-on-accent" "bg-accent/10 text-white"`,
    ]);
    expect(c["accent fill with a literal label"]).toBe(3);
  });

  it("counts a hand-rolled eyebrow: uppercase with an arbitrary tracking", () => {
    const c = count([
      `"text-xs uppercase tracking-[0.2em]" "tracking-[0.1em] font-mono sm:uppercase"`,
      `"eyebrow" "uppercase tracking-wide" "tracking-[0.2em]"`,
    ]);
    expect(c["uppercase + tracking-[arbitrary]"]).toBe(2);
  });

  it("counts raw buttons and inputs at call sites, not inside the primitives", () => {
    const root = join(__dirname, "..", "..");
    const src = `<button type="button" /> <input />`;
    const paths = [join(root, "src", "components", "ui", "segmented.tsx"), join(root, "src", "app", "page.tsx")];
    const c = countRaw([src, src], paths) as Record<string, number>;
    expect(c["raw <button"]).toBe(1);
    expect(c["raw <input"]).toBe(1);
  });

  it("walks .ts class maps as well as .tsx, and skips declaration files", () => {
    const root = join(__dirname, "..", "..");
    const files = (walkRaw(join(root, "src")) as string[]).map((f) => f.replace(/\\/g, "/"));
    expect(files.some((f) => f.endsWith("src/lib/status-tone.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith(".tsx"))).toBe(true);
    expect(files.some((f) => f.endsWith(".d.ts"))).toBe(false);
  });

  // The ratchet reads every source file: about 3.5s alone, and past the 5s
  // default once the full suite shares the machine, so it gets its own budget.
  it("passes against the committed baseline", () => {
    const root = join(__dirname, "..", "..");
    expect(() => execFileSync(process.execPath, [join(root, "scripts", "style-ratchet.mjs")], { cwd: root })).not.toThrow();
  }, 30_000);
});
