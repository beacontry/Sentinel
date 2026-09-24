/**
 * The "how it works" illustration: a 30-day equity curve with annotated
 * trade events. It is sample data, so it says so at every width ("Demo
 * data", 12px, never hidden), and every colour is a theme token through
 * fill-/stroke- utilities, so it follows the theme and colour-blind mode
 * instead of staying emerald-on-black on the light themes.
 *
 * The fake window chrome (three traffic-light dots) is gone: it imitated
 * an operating system and carried no information.
 */

const CURVE =
  "M 40 320 C 70 318, 100 314, 130 305 C 160 296, 180 308, 200 295 L 230 285 " +
  "C 260 282, 285 268, 310 255 L 340 270 C 370 258, 395 240, 420 222 " +
  "C 450 208, 480 195, 510 175 L 540 162 L 580 145";

// SVG text is sized in viewBox units (600 wide); 12 reads as 12px when the
// chart is 600px wide. The ticks and callouts are decorative: the chart is
// one image with its own accessible name.
const LABEL = { fontSize: 12 } as const;
const CALLOUT = { fontSize: 12, fontWeight: 600 } as const;

type Tone = "accent" | "bearish" | "bullish" | "warning";
const FILL: Record<Tone, string> = {
  accent: "fill-ld-accent",
  bearish: "fill-ld-red",
  bullish: "fill-ld-green",
  warning: "fill-ld-amber",
};
const STROKE: Record<Tone, string> = {
  accent: "stroke-ld-accent",
  bearish: "stroke-ld-red",
  bullish: "stroke-ld-green",
  warning: "stroke-ld-amber",
};

// The four annotated events. Below sm the callouts are too small to read
// inside the chart, so the same list is printed as a legend under it.
const MARKERS: { x: number; y: number; top: number; width: number; label: string; tone: Tone }[] = [
  { x: 130, y: 305, top: 56, width: 104, label: "BUY · INTC", tone: "accent" },
  { x: 200, y: 295, top: 96, width: 96, label: "Stop −1.8%", tone: "bearish" },
  { x: 310, y: 255, top: 146, width: 104, label: "AAPL +5.2%", tone: "bullish" },
  { x: 420, y: 222, top: 36, width: 84, label: "Trail ↑", tone: "warning" },
];
const DOT: Record<Tone, string> = {
  accent: "bg-ld-accent",
  bearish: "bg-ld-red",
  bullish: "bg-ld-green",
  warning: "bg-ld-amber",
};

function Marker({
  x,
  y,
  top,
  width,
  label,
  tone,
}: {
  x: number;
  y: number;
  top: number;
  width: number;
  label: string;
  tone: Tone;
}) {
  return (
    <g>
      <circle cx={x} cy={y} r="4" className={`${FILL[tone]} stroke-ld-deep`} strokeWidth="2" />
      <g className="hidden sm:inline">
        <line x1={x} y1={y} x2={x} y2={top + 20} className={STROKE[tone]} strokeWidth="0.5" strokeDasharray="2 3" opacity="0.6" />
        <rect x={x - width / 2} y={top} width={width} height="24" rx="4" className={`fill-ld-card ${STROKE[tone]}`} strokeOpacity="0.5" />
        <text x={x} y={top + 16} textAnchor="middle" className={`${FILL[tone]} font-mono`} style={CALLOUT}>
          {label}
        </text>
      </g>
    </g>
  );
}

export function EquityMockup() {
  return (
    <figure className="animate-fade-in-up stagger-1 overflow-hidden rounded-xl border border-ld-border bg-ld-deep shadow-pop">
      <figcaption className="flex items-center justify-between gap-2 border-b border-ld-border bg-ld-card px-4 py-3">
        <span className="font-mono text-xs text-ld-text-muted">beacontry · 30-day equity</span>
        <span className="rounded-full border border-ld-border px-2 py-0.5 font-mono text-xs text-ld-text-secondary">Demo data</span>
      </figcaption>

      {/* Stats strip — sample figures, labelled as such above */}
      <dl className="grid grid-cols-3 border-b border-ld-border bg-ld-card px-4 py-3 text-center">
        <div>
          <dt className="eyebrow text-ld-text-muted">P/L</dt>
          <dd className="font-mono text-base font-bold text-ld-green">
            <span aria-hidden="true">▲ </span>+18.4%
          </dd>
        </div>
        <div className="border-x border-ld-border">
          <dt className="eyebrow text-ld-text-muted">Win rate</dt>
          <dd className="font-mono text-base font-bold text-ld-text">64%</dd>
        </div>
        <div>
          <dt className="eyebrow text-ld-text-muted">Trades</dt>
          <dd className="font-mono text-base font-bold text-ld-text">23</dd>
        </div>
      </dl>

      <div className="p-4 pt-2">
        <svg
          viewBox="0 0 600 360"
          className="h-auto w-full"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Sample 30-day equity curve rising about 18 percent, with a buy, a stopped-out loss, a profit taken and a tightened trailing stop marked"
        >
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--color-ld-accent)", stopOpacity: 0.3 }} />
              <stop offset="100%" style={{ stopColor: "var(--color-ld-accent)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>

          {[80, 140, 200, 260, 320].map((y) => (
            <line key={y} x1="40" x2="580" y1={y} y2={y} className="stroke-ld-border" strokeWidth="0.5" strokeDasharray="3 3" />
          ))}

          {/* The axis labels sat at x=585 in a 600-wide box and were cut to
              "+2", "+1". They now end at the plot's left edge. Below sm the
              chart is ~330px wide, so 12 units would render under 6px: the
              labels and callouts hide there, and the curve, the markers and
              the figures above carry the story. */}
          <g className="hidden fill-ld-text-muted font-mono sm:inline" style={LABEL} textAnchor="end">
            <text x="34" y="84">+20%</text>
            <text x="34" y="144">+15%</text>
            <text x="34" y="204">+10%</text>
            <text x="34" y="264">+5%</text>
            <text x="34" y="324">0%</text>
          </g>

          <g className="hidden fill-ld-text-muted font-mono sm:inline" style={LABEL} textAnchor="middle">
            <text x="60" y="348">W1</text>
            <text x="180" y="348">W2</text>
            <text x="300" y="348">W3</text>
            <text x="420" y="348">W4</text>
            <text x="540" y="348">Today</text>
          </g>

          <path d={`${CURVE} L 580 320 L 40 320 Z`} fill="url(#equityFill)" />
          <path d={CURVE} fill="none" className="stroke-ld-accent" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

          {MARKERS.map((m) => (
            <Marker key={m.label} {...m} />
          ))}

          <circle cx="580" cy="145" r="7" className="fill-ld-accent" opacity="0.2" />
          <circle cx="580" cy="145" r="4" className="fill-ld-accent stroke-ld-deep" strokeWidth="2" />
        </svg>

        {/* Phone legend: the callouts above hide below sm, where they would
            render under 6px. Left to right, as the dots sit on the curve. */}
        <ol className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:hidden" aria-hidden="true">
          {MARKERS.map((m) => (
            <li key={m.label} className="flex min-w-0 items-center gap-2 font-mono text-xs text-ld-text-secondary">
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[m.tone]}`} />
              {m.label}
            </li>
          ))}
        </ol>
      </div>

      <p className="border-t border-ld-border px-4 py-3 text-center font-mono text-xs leading-relaxed text-ld-text-muted">
        Illustrative — every signal logged, every stop synced to broker, every trade journaled.
      </p>
    </figure>
  );
}
