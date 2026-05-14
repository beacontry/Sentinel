import Link from "next/link";
import { Shield, Sparkles } from "lucide-react";

interface PreviewStat {
  label: string;
  value: string;
}

interface PreviewLane {
  label: string;
  value: string;
  detail: string;
  tone?: "brand" | "bullish" | "neutral";
}

interface WorkspacePreviewProps {
  eyebrow: string;
  title: string;
  description: string;
  protocolTitle: string;
  protocolSteps: string[];
  stats: PreviewStat[];
  lanes: PreviewLane[];
}

const toneClasses: Record<NonNullable<PreviewLane["tone"]>, string> = {
  brand: "text-accent",
  bullish: "text-bullish",
  neutral: "text-text-primary",
};

export function WorkspacePreview({
  eyebrow,
  title,
  description,
  protocolTitle,
  protocolSteps,
  stats,
  lanes,
}: WorkspacePreviewProps) {
  return (
    <section className="hidden border-r border-border p-10 lg:flex lg:flex-col">
      <Link href="/" className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-[10px] border border-accent/25 bg-accent/12 text-accent">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <div className="font-display text-2xl leading-none text-text-primary">Beacontry</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.08em] text-text-muted">
            Market Operating Desk
          </div>
        </div>
      </Link>

      <div className="mt-10 grid flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,1fr)]">
        <div className="flex flex-col justify-between gap-8">
          <div>
            <div className="inline-flex rounded-[10px] border border-accent/25 bg-accent/10 px-3 py-1 text-[11px] uppercase tracking-[0.08em] text-accent">
              {eyebrow}
            </div>
            <h1 className="mt-6 font-display text-4xl leading-[0.95] text-text-primary xl:text-5xl">
              {title}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-text-secondary">
              {description}
            </p>
          </div>

          <div className="rounded-[14px] border border-border bg-bg-secondary p-5">
            <div className="text-[11px] uppercase tracking-[0.08em] text-accent">
              {protocolTitle}
            </div>
            <div className="mt-4 space-y-3">
              {protocolSteps.map((step, index) => (
                <div
                  key={step}
                  className="flex items-start gap-3 rounded-[10px] border border-border bg-bg-elevated px-4 py-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-accent/25 bg-accent/10 text-xs font-mono text-accent">
                    {index + 1}
                  </div>
                  <p className="pt-1 text-sm leading-relaxed text-text-secondary">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[14px] border border-border bg-bg-elevated p-5 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em] text-accent">
                  Workspace Preview
                </div>
                <div className="mt-2 font-display text-2xl text-text-primary">
                  Live desk surfaces
                </div>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-accent/25 bg-accent/12 text-accent">
                <Sparkles className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {lanes.map((lane) => (
                <div
                  key={lane.label}
                  className="rounded-[10px] border border-border bg-bg-elevated px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-text-muted">
                      {lane.label}
                    </div>
                    <div className={`text-sm font-semibold ${toneClasses[lane.tone ?? "neutral"]}`}>
                      {lane.value}
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                    {lane.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-[10px] border border-border bg-bg-secondary px-4 py-4"
              >
                <div className="text-[11px] uppercase tracking-[0.08em] text-text-muted">
                  {stat.label}
                </div>
                <div className="mt-2 font-display text-2xl text-text-primary">
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
