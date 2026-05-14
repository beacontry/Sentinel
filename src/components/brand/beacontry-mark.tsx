// Beacontry lighthouse logo mark.
//
// Inspired by the user's 2026-05-14 reference: lighthouse with twin
// horizontal light beams sitting atop a shield that contains a
// candlestick chart. Single-color SVG using `currentColor` so it
// inherits whatever text color it's placed on — works on the emerald
// accent square in the sidebar (white-on-emerald), on the dark landing
// nav, and any future surface.
//
// Two variants for two contexts:
//   - `mark` (default, 40×40 viewBox) — lighthouse + beams only. Used
//     in tight spaces: sidebar logo square, mobile nav, favicon
//     contexts. Stays legible down to 16px.
//   - `full` (64×72 viewBox, slightly taller) — adds the shield frame
//     and a small candlestick chart inside. Used on larger surfaces:
//     login/register page brand mark, landing hero, OG cards.
//
// For the full multi-color marketing raster (hero banners, app store
// screenshots, press kit), the user's reference image goes at
// /public/brand/beacontry-logo-full.png.

interface BeacontryMarkProps {
  className?: string;
  /** Variant — see component header. */
  variant?: "mark" | "full";
  /**
   * When true, the beams render slightly brighter (good when placed on
   * a dark colored background like the sidebar's emerald square). When
   * false, beams use a subtle muted variant (good when sitting on a
   * neutral surface where contrast is already strong).
   */
  brightBeams?: boolean;
  "aria-label"?: string;
}

export function BeacontryMark({
  className = "h-5 w-5",
  variant = "mark",
  brightBeams = true,
  "aria-label": ariaLabel,
}: BeacontryMarkProps) {
  const beamOuter = brightBeams ? 0.32 : 0.16;
  const beamInner = brightBeams ? 0.55 : 0.32;

  if (variant === "full") {
    return (
      <svg
        viewBox="0 0 64 72"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        role={ariaLabel ? "img" : undefined}
        aria-label={ariaLabel}
        aria-hidden={ariaLabel ? undefined : "true"}
      >
        {/* ─── Shield outline (back) ─── */}
        {/* Heater-shield shape: rectangle on top, curved sides, point at bottom. */}
        <path
          d="M 8 28 L 56 28 L 56 46 Q 56 60 32 68 Q 8 60 8 46 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />

        {/* ─── Candlestick chart (inside shield, behind tower) ─── */}
        {/* Six candles flanking the tower — three on each side. Tower
            visually splits the chart, which is what the reference does. */}
        <g opacity="0.7">
          <rect x="13" y="46" width="2" height="10" />
          <rect x="17" y="42" width="2" height="14" />
          <rect x="21" y="48" width="2" height="8" />
          <rect x="41" y="44" width="2" height="12" />
          <rect x="45" y="40" width="2" height="16" />
          <rect x="49" y="46" width="2" height="10" />
        </g>

        {/* Trend / mountain line cutting through the chart */}
        <polyline
          points="11,52 16,47 20,50 24,44 32,52 40,48 44,44 48,49 53,47"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        />

        {/* ─── Light beams (behind tower lantern) ─── */}
        <path d="M 24 22 L 0 16 L 0 28 Z" opacity={beamOuter} />
        <path d="M 40 22 L 64 16 L 64 28 Z" opacity={beamOuter} />
        <path d="M 24 22 L 4 19 L 4 25 Z" opacity={beamInner} />
        <path d="M 40 22 L 60 19 L 60 25 Z" opacity={beamInner} />

        {/* ─── Lighthouse (front layer, overlays shield + chart) ─── */}
        {/* Tower body — trapezoid widening to base; descends past
            shield top edge so the tower "rises from inside the shield". */}
        <path d="M 26 26 L 38 26 L 40 60 L 24 60 Z" />
        {/* Subtle diagonal stripe on tower (matches reference's banded look) */}
        <path d="M 37.5 28 L 38.5 34 L 25.5 34 L 26.5 28 Z" opacity="0.2" />
        {/* Lantern room — the lit chamber beams emerge from */}
        <rect x="25" y="18" width="14" height="8" />
        <rect x="25" y="22" width="14" height="0.6" opacity="0.4" />
        {/* Cap — triangular roof */}
        <path d="M 24 18 L 32 9 L 40 18 L 38 19 L 26 19 Z" />
        {/* Spire — top antenna */}
        <rect x="31.4" y="3" width="1.2" height="6" rx="0.6" />
      </svg>
    );
  }

  // Default — `mark` variant: lighthouse + beams only. Optimized for
  // tight spaces (sidebar, favicon, mobile nav).
  return (
    <svg
      viewBox="0 0 40 40"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : "true"}
    >
      <path d="M 14 18 L 1 12 L 1 24 Z" opacity={beamOuter} />
      <path d="M 26 18 L 39 12 L 39 24 Z" opacity={beamOuter} />
      <path d="M 14 18 L 3 14 L 3 22 Z" opacity={beamInner} />
      <path d="M 26 18 L 37 14 L 37 22 Z" opacity={beamInner} />
      <rect x="19.4" y="3" width="1.2" height="4" rx="0.5" />
      <path d="M 14 14 L 20 7 L 26 14 L 24 15 L 16 15 Z" />
      <rect x="15" y="15" width="10" height="6" />
      <rect x="15" y="17.5" width="10" height="0.6" opacity="0.4" />
      <path d="M 16 21 L 24 21 L 26 36 L 14 36 Z" />
      <path d="M 24.5 23 L 25.5 27 L 17 27 L 16 23 Z" opacity="0.18" />
    </svg>
  );
}
