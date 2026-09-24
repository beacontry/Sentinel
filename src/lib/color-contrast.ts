/**
 * Colour parsing and WCAG contrast for the theme tokens in globals.css.
 *
 * The tokens are written in OKLCH, which browsers render but Node cannot,
 * so the contrast test (tests/unit/theme-contrast.test.ts) converts them to
 * sRGB here. Only the forms the token file actually uses are parsed:
 * `#rrggbb`, `#rgb`, `rgb()/rgba()` with numbers, and `oklch(L% C H)` with an
 * optional `/ alpha`. Anything else throws, so a new syntax in the token
 * file fails the test loudly instead of being skipped.
 *
 * The OKLab matrices are Björn Ottosson's published ones. Out-of-gamut
 * values are clipped per channel, which is what browsers do for sRGB
 * output in practice and is close enough for a 4.5:1 floor.
 */

/** Linear-light sRGB, each channel in [0, 1], plus alpha. */
export interface LinearRgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** OKLCH (L in 0-1, C, H in degrees) to linear sRGB, clipped to gamut. */
export function oklchToLinear(L: number, C: number, H: number): [number, number, number] {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function num(part: string, percentScale: number): number {
  const t = part.trim();
  if (t.endsWith("%")) return (parseFloat(t) / 100) * percentScale;
  const n = parseFloat(t);
  if (Number.isNaN(n)) throw new Error(`not a number: ${part}`);
  return n;
}

/** Parse one colour value from the token file. Throws on anything else. */
export function parseColor(value: string): LinearRgba {
  const v = value.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    const [r, g, b] = [0, 2, 4].map((i) => srgbToLinear(parseInt(h.slice(i, i + 2), 16) / 255));
    return { r, g, b, a: 1 };
  }

  const fn = /^(rgba?|oklch)\((.*)\)$/.exec(v);
  if (!fn) throw new Error(`unsupported colour: ${value}`);
  const [channels, alphaPart] = fn[2].split("/");
  const parts = channels.includes(",") ? channels.split(",") : channels.trim().split(/\s+/);
  let alpha = alphaPart !== undefined ? num(alphaPart, 1) : 1;

  if (fn[1] === "oklch") {
    if (parts.length !== 3) throw new Error(`oklch needs three channels: ${value}`);
    const [r, g, b] = oklchToLinear(num(parts[0], 1), num(parts[1], 0.4), num(parts[2], 1));
    return { r, g, b, a: alpha };
  }

  if (parts.length === 4) alpha = num(parts[3], 1);
  const [r, g, b] = parts.slice(0, 3).map((p) => srgbToLinear(clamp01(num(p, 255) / 255)));
  return { r, g, b, a: alpha };
}

/** Composite a possibly translucent colour over an opaque backdrop. */
export function over(top: LinearRgba, backdrop: LinearRgba): LinearRgba {
  // Browsers composite in gamma-encoded sRGB, so blend there.
  const mix = (t: number, b: number) =>
    srgbToLinear(linearToSrgb(t) * top.a + linearToSrgb(b) * (1 - top.a));
  return { r: mix(top.r, backdrop.r), g: mix(top.g, backdrop.g), b: mix(top.b, backdrop.b), a: 1 };
}

export function relativeLuminance(c: LinearRgba): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** WCAG 2.x contrast ratio. A translucent foreground is composited first. */
export function contrastRatio(foreground: string, background: string): number {
  const bg = parseColor(background);
  if (bg.a < 1) throw new Error(`background must be opaque: ${background}`);
  const fg = over(parseColor(foreground), bg);
  const [hi, lo] = [relativeLuminance(fg), relativeLuminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `#rrggbb` for an opaque colour, for meta theme-color and the manifest. */
export function toHex(value: string): string {
  return hexOf(parseColor(value));
}

/**
 * A translucent colour composited over an opaque backdrop, as `#rrggbb`:
 * what a tint such as `bg-accent/15` renders as on a given surface, so
 * text placed on it can be measured.
 */
export function flatten(top: string, backdrop: string): string {
  const bg = parseColor(backdrop);
  if (bg.a < 1) throw new Error(`backdrop must be opaque: ${backdrop}`);
  return hexOf(over(parseColor(top), bg));
}

function hexOf(c: LinearRgba): string {
  return (
    "#" +
    [c.r, c.g, c.b]
      .map((x) => Math.round(clamp01(linearToSrgb(x)) * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Linear sRGB to OKLab [L, a, b]. */
function linearToOklab(c: LinearRgba): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b);
  const m = Math.cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b);
  const s = Math.cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/**
 * Colour difference as deltaE OK: straight-line distance in OKLab of the
 * two opaque colours as rendered (after gamut clipping). Around 0.02 is a
 * just-noticeable difference side by side; 0.10 reads as a different
 * colour at a glance, which is the floor for two meanings. With `vision`
 * set, both colours are first simulated for that dichromacy.
 */
export function deltaEOK(x: string, y: string, vision: Vision = "normal"): number {
  const [a, b] = [parseColor(x), parseColor(y)];
  if (a.a < 1 || b.a < 1) throw new Error(`deltaEOK needs opaque colours: ${x}, ${y}`);
  const [p, q] = [linearToOklab(simulateVision(a, vision)), linearToOklab(simulateVision(b, vision))];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** Colour vision for deltaEOK: typical, or a full dichromacy. */
export type Vision = "normal" | "deuteranopia" | "protanopia";

/**
 * Machado, Oliveira and Fernandes (2009), severity 1.0, applied to linear
 * sRGB as the paper's model assumes. Deuteranopia and protanopia are the
 * two red-green dichromacies colour-blind mode is designed for; what is
 * left to them is lightness and the blue-yellow axis.
 */
const DICHROMACY: Record<Exclude<Vision, "normal">, number[][]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};

/** How an opaque colour appears to a reader with the given vision. */
export function simulateVision(c: LinearRgba, vision: Vision): LinearRgba {
  if (vision === "normal") return c;
  const m = DICHROMACY[vision];
  const row = (i: number) => clamp01(m[i][0] * c.r + m[i][1] * c.g + m[i][2] * c.b);
  return { r: row(0), g: row(1), b: row(2), a: c.a };
}
