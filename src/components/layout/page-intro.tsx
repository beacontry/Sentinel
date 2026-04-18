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
  title,
  description,
  actions,
  stats,
}: PageIntroProps) {
  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            {title}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {description}
          </p>
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>

      {stats && stats.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-xs text-text-muted uppercase tracking-wider">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-2">
              <span>{stat.label}:</span>
              <span className={`font-semibold font-mono normal-case ${toneClasses[stat.tone ?? "neutral"]}`}>
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
