"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EducationalDisclaimer } from "@/components/education/educational-disclaimer";

/**
 * Term + Invest the Difference vs Whole Life.
 *
 * Strategy A — Whole Life:
 *   Pay premium W per year. After `years`, ending cash value modeled at the
 *   user-supplied IRR (default 3% net of fees).
 *
 * Strategy B — Buy Term + Invest the Difference (BTID):
 *   Pay premium T per year for the same coverage period. Invest (W - T) in a
 *   broad index fund earning the user-supplied market return. After the term
 *   period (default 20 yrs), continue investing the full W (since term has
 *   ended) for the remaining horizon. Apply 15% LTCG on the gain at the end.
 *
 * Both end with the same `years` horizon. Whole Life has cash value AND a
 * lifetime death benefit; BTID has the brokerage balance and term coverage
 * during the working years. The death-benefit comparison is shown separately
 * because the products serve different functions.
 */

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fv(annual: number, rate: number, years: number): number {
  if (rate === 0) return annual * years;
  return annual * ((Math.pow(1 + rate, years) - 1) / rate);
}

export function TermVsWholeLifeCalculator() {
  const [wholeLifePremium, setWholeLifePremium] = useState(8400); // ~$700/mo
  const [termPremium, setTermPremium] = useState(360); // ~$30/mo
  const [termYears, setTermYears] = useState(20);
  const [horizonYears, setHorizonYears] = useState(40);
  const [wholeLifeIRR, setWholeLifeIRR] = useState(3); // net IRR of cash value
  const [marketReturn, setMarketReturn] = useState(7);

  const result = useMemo(() => {
    const wlRate = wholeLifeIRR / 100;
    const mktRate = marketReturn / 100;

    // Whole life cash value at horizon
    const wholeLifeEnd = fv(wholeLifePremium, wlRate, horizonYears);

    // BTID:
    // Phase 1: years 0..termYears, invest (W - T) per year at market rate.
    const phase1Annual = Math.max(0, wholeLifePremium - termPremium);
    const phase1End = fv(phase1Annual, mktRate, termYears);

    // Phase 2: years termYears..horizonYears, invest the full W per year (term has lapsed).
    const phase2Years = Math.max(0, horizonYears - termYears);
    const phase2Contribs = fv(wholeLifePremium, mktRate, phase2Years);
    const phase1GrownDuringPhase2 = phase1End * Math.pow(1 + mktRate, phase2Years);
    const btidPretax = phase1GrownDuringPhase2 + phase2Contribs;

    // LTCG on growth at end (approx — basis = total contributions)
    const btidBasis = phase1Annual * termYears + wholeLifePremium * phase2Years;
    const btidGain = Math.max(0, btidPretax - btidBasis);
    const btidAfterTax = btidPretax - btidGain * 0.15;

    return {
      wholeLifeEnd,
      btidPretax,
      btidAfterTax,
      btidBasis,
      diff: btidAfterTax - wholeLifeEnd,
      winner: btidAfterTax > wholeLifeEnd ? "BTID" : "Whole Life",
    };
  }, [
    wholeLifePremium,
    termPremium,
    termYears,
    horizonYears,
    wholeLifeIRR,
    marketReturn,
  ]);

  return (
    <Card className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">
          Buy Term + Invest the Difference vs Whole Life
        </h3>
        <p className="text-xs text-text-secondary mt-1">
          Compare ending balance assuming identical annual cash outlay over the
          full horizon. After-tax balance shown for the BTID side.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Input
          label="Whole life premium ($/yr)"
          type="number"
          inputMode="numeric"
          value={wholeLifePremium}
          onChange={(e) =>
            setWholeLifePremium(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <Input
          label="Term premium ($/yr, same coverage)"
          type="number"
          inputMode="numeric"
          value={termPremium}
          onChange={(e) =>
            setTermPremium(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <Input
          label="Term length (years)"
          type="number"
          inputMode="numeric"
          value={termYears}
          onChange={(e) =>
            setTermYears(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <Input
          label="Horizon (years)"
          type="number"
          inputMode="numeric"
          value={horizonYears}
          onChange={(e) =>
            setHorizonYears(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <Input
          label="Whole life net IRR (%)"
          type="number"
          inputMode="decimal"
          step="0.1"
          value={wholeLifeIRR}
          onChange={(e) => setWholeLifeIRR(Number(e.target.value) || 0)}
        />
        <Input
          label="Market return (%)"
          type="number"
          inputMode="decimal"
          step="0.1"
          value={marketReturn}
          onChange={(e) => setMarketReturn(Number(e.target.value) || 0)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Bar
          label="Whole Life (cash value)"
          value={result.wholeLifeEnd}
          max={Math.max(result.wholeLifeEnd, result.btidAfterTax)}
          tone={result.winner === "Whole Life" ? "win" : "neutral"}
        />
        <Bar
          label="Term + Invest Difference (after tax)"
          value={result.btidAfterTax}
          max={Math.max(result.wholeLifeEnd, result.btidAfterTax)}
          tone={result.winner === "BTID" ? "win" : "neutral"}
        />
      </div>

      <div className="rounded-lg border border-border bg-bg-elevated p-3 text-sm text-text-secondary leading-relaxed">
        <p>
          <span className="font-semibold text-text-primary">
            {result.winner}
          </span>{" "}
          ends ahead by{" "}
          <span className="font-mono text-text-primary">
            {fmt(Math.abs(result.diff))}
          </span>{" "}
          after {horizonYears} years.
        </p>
        <p className="mt-2 text-xs text-text-muted leading-relaxed">
          Caveats this calculator does NOT capture: (1) Whole Life&apos;s lifetime
          death benefit (BTID has none after term lapses); (2) policy loan
          access pre-tax; (3) sequence-of-returns risk in BTID; (4) cost of
          medically requalifying for term at age 55. For HNW estate-planning
          buyers, the death benefit angle changes the calculus — these are
          different products serving different goals.
        </p>
      </div>

      <EducationalDisclaimer variant="compact" />
    </Card>
  );
}

function Bar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "win" | "neutral";
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const toneClass =
    tone === "win"
      ? "border-accent/30 bg-accent/10"
      : "border-border bg-bg-secondary";
  return (
    <div className={`rounded-xl border p-3 space-y-2 ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
          {label}
        </p>
      </div>
      <p className="text-lg font-mono font-semibold text-text-primary">
        {fmt(value)}
      </p>
      <div className="h-1.5 rounded-full bg-bg-elevated overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            tone === "win" ? "bg-accent" : "bg-text-muted/40"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
