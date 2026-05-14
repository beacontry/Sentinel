// Beacontry lighthouse logo mark.
//
// Inspired by the user's 2026-05-14 reference: stylized lighthouse with
// twin horizontal light beams, conveying the "beacon + sentry" brand
// idea. Single-color SVG using `currentColor` so it inherits whatever
// text color it's placed on — works on the emerald accent square in the
// sidebar (white-on-emerald) and on the dark landing nav.
//
// For larger marketing surfaces (hero, manifest icons, social cards) the
// full-color raster version sits in /public/brand/. This mark is the
// scalable, app-wide version.
//
// Anatomy:
//   - Top spire   (thin vertical stroke)
//   - Cap         (triangular roof)
//   - Lantern     (the lit/glowing room — solid rect)
//   - Tower body  (trapezoid, wider at base)
//   - Beams       (two horizontal triangles fading outward — they're
//                  what makes it read as a *beacon* and not just a
//                  random tower at small sizes)

interface BeacontryMarkProps {
  className?: string;
  /**
   * When true, the beams render slightly brighter (good when placed on a
   * dark colored background like the sidebar's emerald square). When
   * false, beams use a subtle muted variant (good when sitting on a
   * neutral surface where contrast is already strong).
   */
  brightBeams?: boolean;
  "aria-label"?: string;
}

export function BeacontryMark({
  className = "h-5 w-5",
  brightBeams = true,
  "aria-label": ariaLabel,
}: BeacontryMarkProps) {
  const beamOuter = brightBeams ? 0.32 : 0.16;
  const beamInner = brightBeams ? 0.55 : 0.32;

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
      {/* ─── Light beams (left + right of lantern) ─── */}
      {/* Outer faint glow */}
      <path d="M 14 18 L 1 12 L 1 24 Z" opacity={beamOuter} />
      <path d="M 26 18 L 39 12 L 39 24 Z" opacity={beamOuter} />
      {/* Inner brighter core */}
      <path d="M 14 18 L 3 14 L 3 22 Z" opacity={beamInner} />
      <path d="M 26 18 L 37 14 L 37 22 Z" opacity={beamInner} />

      {/* ─── Lighthouse silhouette ─── */}
      {/* Spire (top antenna) */}
      <rect x="19.4" y="3" width="1.2" height="4" rx="0.5" />
      {/* Cap (triangular roof, slightly tapered) */}
      <path d="M 14 14 L 20 7 L 26 14 L 24 15 L 16 15 Z" />
      {/* Lantern room (the lit chamber the beams emerge from) */}
      <rect x="15" y="15" width="10" height="6" />
      {/* Lantern detail: a horizontal accent line for depth */}
      <rect x="15" y="17.5" width="10" height="0.6" opacity="0.4" />
      {/* Tower body — trapezoid widening to the base */}
      <path d="M 16 21 L 24 21 L 26 36 L 14 36 Z" />
      {/* Subtle diagonal accent stripe on the tower for visual interest
          at larger sizes (invisible at small sizes, harmless) */}
      <path
        d="M 24.5 23 L 25.5 27 L 17 27 L 16 23 Z"
        opacity="0.18"
      />
    </svg>
  );
}
