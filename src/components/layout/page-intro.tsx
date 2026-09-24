import type { ReactNode } from "react";
import { STATUS_TONE_TEXT_CLASSES } from "@/lib/status-tone";
import { DirectionGlyph, DirectionWord } from "@/components/ui/signed-value";

type IntroTone = "brand" | "bullish" | "bearish" | "neutral";

interface PageIntroStat {
  label: string;
  /** A preformatted value, or a SignedValue / StatusChip for a gain or state. */
  value: ReactNode;
  /**
   * bullish and bearish on a plain string value also print ▲ or ▼ and a
   * hidden "gain" or "loss", so the tone is never colour alone. A value
   * that is already a SignedValue carries its own glyph; leave tone off.
   */
  tone?: IntroTone;
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

const toneClasses: Record<IntroTone, string> = {
  brand: STATUS_TONE_TEXT_CLASSES.accent,
  bullish: STATUS_TONE_TEXT_CLASSES.bullish,
  bearish: STATUS_TONE_TEXT_CLASSES.bearish,
  neutral: STATUS_TONE_TEXT_CLASSES.neutral,
};

const DIRECTION: Partial<Record<IntroTone, "gain" | "loss">> = { bullish: "gain", bearish: "loss" };

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
          four floating cards: the figures read as one instrument. */}
      {stats && stats.length > 0 && (
        <dl className="mt-6 grid grid-cols-2 gap-2 rounded-xl border border-border bg-bg-secondary p-2 shadow-card sm:grid-cols-4">
          {stats.map((stat) => {
            const direction = typeof stat.value === "string" ? DIRECTION[stat.tone ?? "neutral"] : undefined;
            return (
              <div key={stat.label} className="min-w-0 rounded-lg bg-bg-surface p-3">
                <dt className="eyebrow text-text-muted">{stat.label}</dt>
                <dd className={`mt-1 wrap-anywhere text-lg font-semibold font-mono tabular-nums ${toneClasses[stat.tone ?? "neutral"]}`}>
                  {direction && <DirectionGlyph direction={direction} />}
                  {stat.value}
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
