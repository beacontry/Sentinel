import type { ReactNode } from "react";

type IntroTone = "brand" | "bullish" | "bearish" | "neutral";

interface PageIntroStat {
  label: string;
  value: ReactNode;
  tone?: IntroTone;
}

interface PageIntroProps {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  stats?: PageIntroStat[];
}

const toneClasses: Record<IntroTone, string> = {
  brand: "text-accent",
  bullish: "text-bullish",
  bearish: "text-bearish",
  neutral: "text-text-primary",
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
        <div>
          {eyebrow && (
            <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-text-muted">
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

      {stats && stats.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-border bg-bg-secondary p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-text-muted">{stat.label}</div>
              <div className={`mt-1 text-lg font-semibold font-mono ${toneClasses[stat.tone ?? "neutral"]}`}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
