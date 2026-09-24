import { isValidElement, type ComponentProps, type ReactNode } from "react";
import { STATUS_TONE_TEXT_CLASSES } from "@/lib/status-tone";
import { DirectionGlyph, DirectionWord, GLYPH_CH, SignedValue, signedValueCh } from "@/components/ui/signed-value";
import type { PnlDirection } from "@/lib/format-pnl";
import { textCh, tileRowVars } from "@/lib/figure-fit";

type IntroTone = "brand" | "bullish" | "bearish" | "neutral";

interface PageIntroStat {
  label: string;
  /** A preformatted value, or a SignedValue / StatusChip for a gain or state. */
  value: ReactNode;
  /** Colour only. The label and the printed value carry the meaning. */
  tone?: IntroTone;
  /**
   * Set only when the value really is a gain or a loss (a P&L, a signed
   * return). It prints ▲, ▼ or – and a hidden "gain" or "loss", so the
   * direction never rests on colour. Never inferred from tone: a risk
   * level, a count or a "--" placeholder is coloured without being a gain
   * or a loss. A value that is already a SignedValue carries its own.
   */
  direction?: PnlDirection;
}

interface PageIntroProps {
  /**
   * A kicker above the title. Only when it carries information the title
   * does not (a step, a status, a count): "Execution Desk" over "Trader"
   * repeats it. Optional for that reason.
   */
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  stats?: PageIntroStat[];
}

/**
 * The width in ch of a stat's widest unbreakable run, for the readout's
 * fit. A plain string breaks only at its spaces; with a direction its
 * glyph and figure are one run. A SignedValue reports its own. Anything
 * else (a StatusChip) is words that wrap, so it asks for nothing.
 */
export function statCh(stat: Pick<PageIntroStat, "value" | "direction">): number {
  const { value, direction } = stat;
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value);
    return direction ? [...text].length + GLYPH_CH : textCh(text);
  }
  if (isValidElement<ComponentProps<typeof SignedValue>>(value) && value.type === SignedValue) {
    const p = value.props;
    return signedValueCh(p.value, p.basis, p.format, p.glyph);
  }
  return 0;
}

const toneClasses: Record<IntroTone, string> = {
  brand: STATUS_TONE_TEXT_CLASSES.accent,
  bullish: STATUS_TONE_TEXT_CLASSES.bullish,
  bearish: STATUS_TONE_TEXT_CLASSES.bearish,
  neutral: STATUS_TONE_TEXT_CLASSES.neutral,
};

export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
  stats,
}: PageIntroProps) {
  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <div className="eyebrow mb-2 text-text-muted">
              {eyebrow}
            </div>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-7 text-text-secondary">
            {description}
          </p>
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>

      {/* One bordered readout strip holding borderless tiles, rather than
          four floating cards: the figures read as one instrument. A figure
          is never split mid-number and never runs past its tile: the row
          steps every figure down from text-lg towards the 12px floor until
          the widest fits, and a figure too wide even at the floor drops
          the grid a column. The same rule as the trader desk tiles
          (src/lib/figure-fit.ts). */}
      {stats && stats.length > 0 && (
        <dl
          className="mt-6 tile-grid rounded-xl border border-border bg-bg-secondary p-2 shadow-card [--tile-cols:2] sm:[--tile-cols:4]"
          style={tileRowVars(Math.max(...stats.map(statCh)))}
        >
          {stats.map((stat) => {
            const direction = stat.direction;
            return (
              <div key={stat.label} className="@container min-w-0 rounded-lg bg-bg-surface p-3">
                <dt className="eyebrow text-text-muted">{stat.label}</dt>
                <dd
                  className={`mt-1 figure-fit font-semibold font-mono tabular-nums [--figure-max:var(--text-lg)] ${toneClasses[stat.tone ?? "neutral"]}`}
                >
                  {direction ? (
                    <span className="whitespace-nowrap">
                      <DirectionGlyph direction={direction} />
                      {stat.value}
                    </span>
                  ) : (
                    stat.value
                  )}
                  {direction && <DirectionWord direction={direction} />}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
