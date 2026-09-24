/**
 * WCAG contrast of every colour-token pair that carries meaning, in all
 * five themes and in colour-blind mode on each, computed from the values
 * in src/app/globals.css.
 *
 * The light theme is the @theme block. dark, coral, light-blue and gray
 * are `html.<name>` blocks that override it, and colour-blind mode is one
 * fixed set per luminance family on top of that: `html.colorblind` for
 * the light themes, `html.colorblind.dark, .gray` for the dark ones. The tokens are OKLCH; src/lib/color-contrast.ts converts them.
 *
 * - A label on an accent fill must clear 4.5:1 at rest and on hover.
 *   White on the old #10b981 was 2.5:1.
 * - Body text (primary, secondary, muted) must clear 4.5:1 on every
 *   surface it is placed on.
 * - A form control's edge must clear 3:1 (WCAG 1.4.11) on every surface.
 * - Gain and loss text must clear 4.5:1 on a card, and each chip's
 *   foreground must clear 4.5:1 on its own fill.
 * - Accent text (a link, an active pill) must clear 4.5:1 on every
 *   surface, on the hover row, and on its own tint at the strongest
 *   alpha the markup uses (bg-accent/15).
 * - Two colours that mean different things must look different: the
 *   accent (and its hover) against a loss, the danger fill and a
 *   warning, a loss and a warning against the body text, and in
 *   colour-blind mode a loss against a warning. Measured as deltaE OK,
 *   floor 0.10. Contrast ratio cannot catch this: two reds of equal
 *   lightness are 1.0:1 whatever their hue.
 * - The semantic set as a whole: gain, loss and warning pairwise, each
 *   against every text colour, and the accent against the gain and the
 *   secondary text. Fixing one pair at a time is how coral kept moving
 *   its collision from one pair to the next.
 * - In colour-blind mode every theme is measured again as typical,
 *   deuteranope and protanope vision see it (Machado 2009 simulation):
 *   the states and their -fg tokens against each other, against the
 *   three text colours, and against the accent and its hover.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio, deltaEOK, flatten, parseColor, toHex, type Vision } from "@/lib/color-contrast";

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

/**
 * A theme with colour-blind mode on. The dark block is written as
 * `html.colorblind.dark`, so on a dark theme both blocks apply, the dark
 * one winning.
 */
const withColorblind = (name: string): Record<string, string> => ({
  ...THEMES[name],
  ...colorblindLight,
  ...(DARK.has(name) ? colorblindDark : {}),
});

const MODES: [string, Record<string, string>][] = Object.entries(THEMES).flatMap(([name, vars]) => [
  [name, vars] as [string, Record<string, string>],
  [`${name} + colour-blind`, withColorblind(name)],
]);

/** deltaE OK below which two meanings read as one colour. */
const DISTINCT = 0.1;

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

/**
 * `color-mix(in oklch, a p, b)` for two opaque oklch() values: L, C and
 * H interpolated, hue along the shorter arc, as the CSS spec does.
 */
function mixOklch(a: string, b: string, p: number): string {
  const parts = (v: string) => {
    const m = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(v);
    if (!m) throw new Error(`not an opaque oklch(): ${v}`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  const [la, ca, ha] = parts(a);
  const [lb, cb, hb] = parts(b);
  let dh = ha - hb;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const h = (((hb + dh * p) % 360) + 360) % 360;
  return `oklch(${lb + (la - lb) * p}% ${cb + (ca - cb) * p} ${h})`;
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

  it.each(TEXT_SURFACES)("accent text is at least 4.5:1 on %s", (surface) => {
    expect(cr("--color-accent", surface)).toBeGreaterThanOrEqual(4.5);
  });

  // The active-pill pattern: text-accent on bg-accent/10 to /15 (and on
  // accent-muted, 12-15%). The strongest tint is the darkest backdrop.
  it.each(["--color-bg-primary", "--color-bg-secondary"])(
    "accent text is at least 4.5:1 on its /15 tint over %s",
    (surface) => {
      const accent = resolve(vars, "--color-accent");
      const tint = flatten(accent.replace(/\)$/, " / 0.15)"), resolve(vars, surface));
      expect(contrastRatio(accent, tint)).toBeGreaterThanOrEqual(4.5);
    },
  );

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

  // A banner on a state fill carries body text and a heading in the state
  // colour, not only the -fg label.
  it.each(
    ["bullish", "bearish", "warning"].flatMap((state) =>
      ["--color-text-primary", "--color-text-secondary", "--color-text-muted", `--color-${state}`].map((t) => [
        t,
        `--color-${state}-fill`,
      ]),
    ),
  )("%s on %s is at least 4.5:1", (text, fill) => {
    expect(cr(text, fill)).toBeGreaterThanOrEqual(4.5);
  });

  // The destructive Button's hover fill (button.tsx): 18% of the loss
  // colour mixed into the surface in OKLCH, under its -fg label.
  it("the destructive button's label is at least 4.5:1 on its hover fill", () => {
    const hover = mixOklch(resolve(vars, "--color-bearish"), resolve(vars, "--color-bg-surface"), 0.18);
    expect(contrastRatio(resolve(vars, "--color-bearish-fg"), hover)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([1, 2, 3, 4, 5, 6])("chart series %i is at least 3:1 on the chart background", (n) => {
    expect(cr(`--color-series-${n}`, "--color-bg-surface")).toBeGreaterThanOrEqual(3);
  });

  it.each(["bullish", "bearish", "warning"])("%s-line is at least 3:1 on bg-secondary", (state) => {
    expect(cr(`--color-${state}-line`, "--color-bg-secondary")).toBeGreaterThanOrEqual(3);
  });

  // Segmented (segmented.tsx): the chosen option sits in a bg-primary
  // track, and its edge is the indicator that must clear 3:1 (WCAG
  // 1.4.11). The raised fill alone is about 1.1:1 on the track.
  it.each(["--color-border-control", "--color-bullish-line", "--color-bearish-line"])(
    "segmented chosen edge %s is at least 3:1 on its bg-primary track",
    (edge) => {
      expect(cr(edge, "--color-bg-primary")).toBeGreaterThanOrEqual(3);
    },
  );

  // The primary action must not be the colour of a loss, of the
  // irreversible danger fill, or of a warning. Coral once measured 0.02
  // against the loss, and then 0.05 against the warning once its accent
  // moved toward orange: a hovered button matched a HOLD chip.
  it.each(
    ["--color-accent", "--color-accent-hover"].flatMap((a) =>
      ["--color-bearish", "--color-bearish-solid", "--color-warning", "--color-warning-line"].map((b) => [a, b]),
    ),
  )("%s is distinct from %s", (a, b) => {
    expect(deltaEOK(resolve(vars, a), resolve(vars, b))).toBeGreaterThanOrEqual(DISTINCT);
  });

  // A loss figure or a warning printed in its state colour must not look
  // like the ordinary text around it. Coral in colour-blind mode once put
  // the loss 0.055 from the secondary text. The -fg tokens are left out:
  // they only ever sit on their own -fill (status-tone.ts), which carries
  // the difference.
  it.each(
    ["--color-bearish", "--color-warning"].flatMap((s) =>
      ["--color-text-primary", "--color-text-secondary", "--color-text-muted"].map((t) => [s, t]),
    ),
  )("%s is distinct from %s", (state, text) => {
    expect(deltaEOK(resolve(vars, state), resolve(vars, text))).toBeGreaterThanOrEqual(DISTINCT);
  });
});

/** The trading states: gain, loss, warning. */
const STATES = ["--color-bullish", "--color-bearish", "--color-warning"];
const FGS = STATES.map((s) => `${s}-fg`);
const TEXTS = ["--color-text-primary", "--color-text-secondary", "--color-text-muted"];
const VISIONS: Vision[] = ["normal", "deuteranopia", "protanopia"];

/**
 * Modes whose accent is the gain green on purpose (the emerald brand):
 * there a filled button and a gain figure share a hue by design, and the
 * button's shape and label carry the difference. Colour-blind mode is not
 * one of them: it swaps the accent to a neutral blue kept apart from the
 * blue gain.
 */
const ACCENT_IS_GAIN = new Set(["light", "dark", "gray"]);

/**
 * Pairs below the 0.10 floor, held at what they measure: a ratchet, so
 * none can get worse. Raise or delete an entry when a palette improves;
 * never lower one. Keyed "mode | vision | a | b".
 */
const KNOWN_GAPS: Record<string, number> = {
  "light | normal | --color-bullish | --color-text-muted": 0.094,
  // Colour-blind mode on the light themes. A dichromat sees these as
  // lightness plus the blue-yellow axis only, and every warm colour dark
  // enough to be text on bg-hover (L 51% or less) has to fit between text
  // at L 18-24%, 36-38.5% and 47%. A search of the whole in-gamut space
  // (loss hue 40-85, warning 85-110, any lightness that passes 4.5:1)
  // tops out near 0.08 for the loss against the secondary text; this set
  // is that optimum with a vermillion rather than a brown loss. Gain and
  // accent clear 0.10 everywhere; the dark set clears it outright.
  "light + colour-blind | deuteranopia | --color-bearish | --color-warning": 0.093,
  "light + colour-blind | deuteranopia | --color-bearish-fg | --color-warning-fg": 0.093,
  "coral + colour-blind | deuteranopia | --color-bearish | --color-warning": 0.093,
  "coral + colour-blind | deuteranopia | --color-bearish-fg | --color-warning-fg": 0.093,
  "light-blue + colour-blind | deuteranopia | --color-bearish | --color-warning": 0.093,
  "light-blue + colour-blind | deuteranopia | --color-bearish-fg | --color-warning-fg": 0.093,
  "light + colour-blind | deuteranopia | --color-bearish | --color-text-secondary": 0.088,
  "light + colour-blind | deuteranopia | --color-bearish-fg | --color-text-secondary": 0.088,
  "light + colour-blind | deuteranopia | --color-bearish | --color-text-muted": 0.099,
  "light + colour-blind | deuteranopia | --color-bearish-fg | --color-text-muted": 0.099,
  "light + colour-blind | protanopia | --color-bearish | --color-text-secondary": 0.081,
  "light + colour-blind | protanopia | --color-bearish-fg | --color-text-secondary": 0.081,
  "light + colour-blind | protanopia | --color-warning | --color-text-muted": 0.096,
  "light + colour-blind | protanopia | --color-warning-fg | --color-text-muted": 0.096,
  "coral + colour-blind | deuteranopia | --color-bearish | --color-text-secondary": 0.083,
  "coral + colour-blind | deuteranopia | --color-bearish-fg | --color-text-secondary": 0.083,
  "coral + colour-blind | deuteranopia | --color-bearish | --color-text-muted": 0.093,
  "coral + colour-blind | deuteranopia | --color-bearish-fg | --color-text-muted": 0.093,
  "coral + colour-blind | deuteranopia | --color-warning | --color-text-muted": 0.094,
  "coral + colour-blind | deuteranopia | --color-warning-fg | --color-text-muted": 0.094,
  "coral + colour-blind | protanopia | --color-bearish | --color-text-secondary": 0.08,
  "coral + colour-blind | protanopia | --color-bearish-fg | --color-text-secondary": 0.08,
  "coral + colour-blind | protanopia | --color-warning | --color-text-muted": 0.099,
  "coral + colour-blind | protanopia | --color-warning-fg | --color-text-muted": 0.099,
};
const floorFor = (mode: string, vision: Vision, a: string, b: string) =>
  KNOWN_GAPS[`${mode} | ${vision} | ${a} | ${b}`] ?? DISTINCT;

describe.each(MODES)("%s: the semantic set", (mode, vars) => {
  const d = (a: string, b: string) => deltaEOK(resolve(vars, a), resolve(vars, b));
  const floor = (a: string, b: string) => floorFor(mode, "normal", a, b);

  it.each([
    [STATES[0], STATES[1]],
    [STATES[0], STATES[2]],
    [STATES[1], STATES[2]],
    ...TEXTS.map((t) => [STATES[0], t]),
    ["--color-accent", "--color-text-secondary"],
  ])("%s is distinct from %s", (a, b) => {
    expect(d(a, b)).toBeGreaterThanOrEqual(floor(a, b));
  });

  it.skipIf(ACCENT_IS_GAIN.has(mode)).each(["--color-accent", "--color-accent-hover"])(
    "%s is distinct from the gain",
    (a) => {
      expect(d(a, "--color-bullish")).toBeGreaterThanOrEqual(floor(a, "--color-bullish"));
    },
  );
});

describe("colour-blind pair", () => {
  it.each(Object.keys(THEMES))("%s: gain is blue and loss is orange", (theme) => {
    const cb = withColorblind(theme);
    const hue = (name: string) => Number(/oklch\([^)]*\s([\d.]+)\)$/.exec(resolve(cb, name))?.[1]);
    // Nothing in the green band (about 110-200) or the red one (under 40),
    // where a deuteranope loses the distinction.
    expect(hue("--color-bullish")).toBeGreaterThan(200);
    expect(hue("--color-bearish")).toBeGreaterThanOrEqual(40);
    expect(hue("--color-bearish")).toBeLessThan(110);
  });

  // Loss and warning are both warm, and this mode has taken red away, so
  // they are the pair most likely to collapse into one orange. A rejected
  // order (bearish) and a partial fill (warning) must differ by more than
  // their words.
  it.each(
    Object.keys(THEMES).flatMap((theme) => ["", "-fg", "-line"].map((suffix) => [theme, suffix])),
  )("%s: bearish%s is distinct from the matching warning token", (theme, suffix) => {
    const cb = withColorblind(theme);
    expect(
      deltaEOK(resolve(cb, `--color-bearish${suffix}`), resolve(cb, `--color-warning${suffix}`)),
    ).toBeGreaterThanOrEqual(DISTINCT);
  });

  // The set is fixed per luminance family, not tuned per theme.
  it.each([
    ["light", ["coral", "light-blue"]],
    ["dark", ["gray"]],
  ] as [string, string[]][])("%s shares its colour-blind set with %j", (first, others) => {
    const set = [...STATES, ...FGS, "--color-accent", "--color-accent-hover"];
    for (const other of others) {
      for (const name of set) expect(resolve(withColorblind(other), name)).toBe(resolve(withColorblind(first), name));
    }
  });
});

/**
 * Colour-blind mode as its readers see it, on every theme. A deuteranope
 * or protanope keeps lightness and the blue-yellow axis, so two colours
 * 0.13 apart to typical vision can be one colour to them: coral's old
 * orange accent and yellow warning measured 0.007 for a deuteranope.
 * Every state and every -fg token against each other, against the three
 * text colours, and against the accent and its hover, as typical,
 * deuteranope and protanope vision see them. Floors as in KNOWN_GAPS.
 */
const CB_PAIRS: [string, string][] = [
  [STATES[0], STATES[1]],
  [STATES[0], STATES[2]],
  [STATES[1], STATES[2]],
  [FGS[0], FGS[1]],
  [FGS[0], FGS[2]],
  [FGS[1], FGS[2]],
  ...[...STATES, ...FGS].flatMap((s) => TEXTS.map((t) => [s, t] as [string, string])),
  ...["--color-accent", "--color-accent-hover"].flatMap((a) =>
    [...STATES, ...FGS].map((s) => [a, s] as [string, string]),
  ),
];

describe.each(
  Object.keys(THEMES).flatMap((theme) => VISIONS.map((vision) => [theme, vision] as [string, Vision])),
)("%s + colour-blind, seen with %s vision", (theme, vision) => {
  const cb = withColorblind(theme);
  const mode = `${theme} + colour-blind`;

  it.each(CB_PAIRS)("%s is distinct from %s", (a, b) => {
    expect(deltaEOK(resolve(cb, a), resolve(cb, b), vision)).toBeGreaterThanOrEqual(floorFor(mode, vision, a, b));
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
