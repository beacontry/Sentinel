"use client";

import { Info, AlertTriangle, Lightbulb, ShieldAlert } from "lucide-react";
import {
  GlossaryAwareText,
  GlossaryTooltipProvider,
} from "@/components/education/glossary-aware-text";
import type {
  Guide,
  GuideBlock,
  GuideCallout,
  GuideTable,
  CalloutTone,
} from "@/lib/education/guides-data";
import { RothVsTraditionalCalculator } from "@/components/education/calculators/roth-vs-traditional";
import { CollegeFundingCompareCalculator } from "@/components/education/calculators/college-funding-compare";
import { TermVsWholeLifeCalculator } from "@/components/education/calculators/term-vs-whole-life";
import { TaxLossHarvestingCalculator } from "@/components/education/calculators/tax-loss-harvesting";
import { EmployerMatchOptimizerCalculator } from "@/components/education/calculators/employer-match-optimizer";
import { CompoundInterestCalculator } from "@/components/education/calculators/compound-interest";
import { FireNumberCalculator } from "@/components/education/calculators/fire-number";
import { QuarterlyTaxEstimatorCalculator } from "@/components/education/calculators/quarterly-tax-estimator";

// ─── Callout ──────────────────────────────────────────────────────────────

const CALLOUT_STYLES: Record<
  CalloutTone,
  { wrap: string; icon: typeof Info; iconColor: string }
> = {
  info: {
    wrap: "border-accent/20 bg-accent/10",
    icon: Info,
    iconColor: "text-accent",
  },
  tip: {
    wrap: "border-bullish/20 bg-bullish/10",
    icon: Lightbulb,
    iconColor: "text-bullish",
  },
  warning: {
    wrap: "border-warning/20 bg-warning/10",
    icon: AlertTriangle,
    iconColor: "text-warning",
  },
  danger: {
    wrap: "border-bearish/20 bg-bearish/10",
    icon: ShieldAlert,
    iconColor: "text-bearish",
  },
};

function CalloutBlock({ block }: { block: GuideCallout }) {
  const cfg = CALLOUT_STYLES[block.tone];
  const Icon = cfg.icon;
  return (
    <div className={`rounded-xl border p-4 ${cfg.wrap}`}>
      <div className="flex items-start gap-3">
        <Icon
          className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.iconColor}`}
          aria-hidden="true"
        />
        <div className="space-y-1.5">
          {block.title && (
            <p className="text-sm font-semibold text-text-primary">
              {block.title}
            </p>
          )}
          <p className="text-sm leading-relaxed text-text-secondary">
            <GlossaryAwareText text={block.body} />
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────

function TableBlock({ block }: { block: GuideTable }) {
  const align = block.align ?? block.headers.map(() => "left" as const);
  return (
    <figure className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-bg-elevated">
            <tr className="text-left text-text-muted">
              {block.headers.map((h, i) => (
                <th
                  key={i}
                  className={`px-3 py-2 font-medium border-b border-border ${
                    align[i] === "right"
                      ? "text-right"
                      : align[i] === "center"
                      ? "text-center"
                      : ""
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr
                key={r}
                className={
                  r < block.rows.length - 1 ? "border-b border-border/50" : ""
                }
              >
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={`px-3 py-2.5 align-top text-text-secondary ${
                      align[c] === "right"
                        ? "text-right font-mono"
                        : align[c] === "center"
                        ? "text-center"
                        : ""
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.caption && (
        <figcaption className="text-xs text-text-muted">
          {block.caption}
        </figcaption>
      )}
    </figure>
  );
}

// ─── Block dispatcher ─────────────────────────────────────────────────────

function Block({ block }: { block: GuideBlock }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p className="text-sm leading-relaxed text-text-secondary">
          <GlossaryAwareText text={block.text} />
        </p>
      );

    case "heading":
      if (block.level === 4) {
        return (
          <h4 className="text-sm font-semibold text-text-primary mt-2">
            {block.text}
          </h4>
        );
      }
      return (
        <h3 className="text-base font-semibold text-text-primary">
          {block.text}
        </h3>
      );

    case "list": {
      const cls = "ml-5 space-y-1.5 text-sm leading-relaxed text-text-secondary";
      const itemCls = "marker:text-text-muted";
      return block.ordered ? (
        <ol className={`${cls} list-decimal`}>
          {block.items.map((item, i) => (
            <li key={i} className={itemCls}>
              <GlossaryAwareText text={item} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className={`${cls} list-disc`}>
          {block.items.map((item, i) => (
            <li key={i} className={itemCls}>
              <GlossaryAwareText text={item} />
            </li>
          ))}
        </ul>
      );
    }

    case "table":
      return <TableBlock block={block} />;

    case "callout":
      return <CalloutBlock block={block} />;

    case "key-value":
      return (
        <figure className="space-y-2">
          <div className="rounded-xl border border-border bg-bg-secondary p-4">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {block.pairs.map((p, i) => (
                <div key={i} className="flex flex-col">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
                    {p.label}
                  </dt>
                  <dd className="text-sm font-mono text-text-primary mt-0.5">
                    {p.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          {block.caption && (
            <figcaption className="text-xs text-text-muted">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );

    case "calculator": {
      const calc = (() => {
        switch (block.calculator) {
          case "roth-vs-traditional":
            return <RothVsTraditionalCalculator />;
          case "college-funding-compare":
            return <CollegeFundingCompareCalculator />;
          case "term-vs-whole-life":
            return <TermVsWholeLifeCalculator />;
          case "tax-loss-harvesting":
            return <TaxLossHarvestingCalculator />;
          case "employer-match-optimizer":
            return <EmployerMatchOptimizerCalculator />;
          case "compound-interest":
            return <CompoundInterestCalculator />;
          case "fire-number":
            return <FireNumberCalculator />;
          case "quarterly-tax-estimator":
            return <QuarterlyTaxEstimatorCalculator />;
          default:
            return null;
        }
      })();
      return (
        <figure className="space-y-2">
          {calc}
          {block.caption && (
            <figcaption className="text-xs text-text-muted">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
    }

    default:
      return null;
  }
}

// ─── Top-level guide renderer ─────────────────────────────────────────────

export function GuideRenderer({ guide }: { guide: Guide }) {
  return (
    <GlossaryTooltipProvider>
    <article className="space-y-8">
      {/* Key facts strip */}
      {guide.keyFacts.length > 0 && (
        <div className="rounded-xl border border-border bg-bg-secondary p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted mb-3">
            Key facts
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            {guide.keyFacts.map((f, i) => (
              <div key={i} className="flex flex-col">
                <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
                  {f.label}
                </dt>
                <dd className="text-sm font-mono text-text-primary mt-0.5">
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Sections */}
      {guide.sections.map((section) => (
        <section key={section.id} id={section.id} className="space-y-4 scroll-mt-20">
          <h2 className="text-lg font-semibold tracking-tight text-text-primary">
            {section.heading}
          </h2>
          <div className="space-y-4">
            {section.blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </div>
        </section>
      ))}
    </article>
    </GlossaryTooltipProvider>
  );
}

// ─── Table-of-contents sidebar ────────────────────────────────────────────

export function GuideTableOfContents({ guide }: { guide: Guide }) {
  return (
    <nav className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
        On this page
      </p>
      <ul className="space-y-1.5">
        {guide.sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="block text-sm text-text-secondary hover:text-accent transition-colors leading-snug"
            >
              {s.heading}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
