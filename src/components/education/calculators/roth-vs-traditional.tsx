"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EducationalDisclaimer } from "@/components/education/educational-disclaimer";

/**
 * Roth vs Traditional retirement comparison.
 *
 * Logic:
 *  - Traditional: contribution * (1+r)^years, then taxed at retirement bracket.
 *  - Roth: (contribution * (1 - currentBracket)) compounded at same rate, no tax at retirement.
 *  - Apples-to-apples: assume same gross paycheck; the Roth contributor has less to invest
 *    today because they pay tax up front.
 *  - Annual contribution variant: same, applied to a stream of annual contributions.
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
  // Future value of an annuity, contributions at end of year
  if (rate === 0) return annual * years;
  return annual * ((Math.pow(1 + rate, years) - 1) / rate);
}

export function RothVsTraditionalCalculator() {
  const [annual, setAnnual] = useState(7000);
  const [years, setYears] = useState(35);
  const [returnPct, setReturnPct] = useState(7);
  const [currentBracketPct, setCurrentBracketPct] = useState(24);
  const [retirementBracketPct, setRetirementBracketPct] = useState(22);

  const result = useMemo(() => {
    const r = returnPct / 100;
    const tNow = currentBracketPct / 100;
    const tLater = retirementBracketPct / 100;

    // Roth: contribute `annual` (already after-tax). Side-cost: pay `annual * tNow / (1 - tNow)` extra in tax today.
    // To keep it apples-to-apples in "what does this strategy give you in retirement spending power":
    //   Traditional: contribute `annual` pre-tax (deduction returns `annual * tNow` saved).
    //               At retirement, balance taxed at tLater.
    //   Roth: contribute `annual` after-tax. Tax-free at retirement. To match cash outlay,
    //          assume the Traditional saver invests the tax savings in a TAXABLE account.
    //
    // For clarity we model two views:
    //   Simple: same `annual` contribution into each. Traditional taxed on withdrawal.
    //   Equivalent: Traditional saver invests tax savings in taxable @ same rate, taxed at
    //                15% LTCG on growth at end. (Approximation.)

    const rothFinal = fv(annual, r, years); // tax-free
    const tradPretax = fv(annual, r, years);
    const tradAfterTax = tradPretax * (1 - tLater);

    const taxSavingsAnnual = annual * tNow;
    const sideAccount = fv(taxSavingsAnnual, r, years);
    const sideAccountBasis = taxSavingsAnnual * years;
    const sideAccountGain = Math.max(0, sideAccount - sideAccountBasis);
    const sideAccountAfter = sideAccount - sideAccountGain * 0.15;
    const tradEquivalent = tradAfterTax + sideAccountAfter;

    const winner =
      rothFinal > tradEquivalent ? "Roth" : "Traditional + invest tax savings";

    return {
      rothFinal,
      tradAfterTax,
      tradEquivalent,
      sideAccountAfter,
      diffSimple: rothFinal - tradAfterTax,
      diffEquivalent: rothFinal - tradEquivalent,
      winner,
    };
  }, [annual, years, returnPct, currentBracketPct, retirementBracketPct]);

  return (
    <Card className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">
          Roth vs Traditional Retirement Comparison
        </h3>
        <p className="text-xs text-text-secondary mt-1">
          Compare projected after-tax retirement balance assuming identical
          contributions and growth.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Input
          label="Annual contribution ($)"
          type="number"
          inputMode="numeric"
          value={annual}
          onChange={(e) => setAnnual(Math.max(0, Number(e.target.value) || 0))}
        />
        <Input
          label="Years until retirement"
          type="number"
          inputMode="numeric"
          value={years}
          onChange={(e) => setYears(Math.max(0, Number(e.target.value) || 0))}
        />
        <Input
          label="Annual return (%)"
          type="number"
          inputMode="decimal"
          step="0.1"
          value={returnPct}
          onChange={(e) => setReturnPct(Number(e.target.value) || 0)}
        />
        <Input
          label="Current marginal tax rate (%)"
          type="number"
          inputMode="decimal"
          step="0.5"
          value={currentBracketPct}
          onChange={(e) => setCurrentBracketPct(Number(e.target.value) || 0)}
        />
        <Input
          label="Retirement marginal tax rate (%)"
          type="number"
          inputMode="decimal"
          step="0.5"
          value={retirementBracketPct}
          onChange={(e) => setRetirementBracketPct(Number(e.target.value) || 0)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ResultBox
          label="Roth (tax-free)"
          value={fmt(result.rothFinal)}
          tone={result.winner === "Roth" ? "win" : "neutral"}
        />
        <ResultBox
          label="Traditional (after retirement tax)"
          value={fmt(result.tradAfterTax)}
          tone="neutral"
          sub="Same contribution, taxed on withdrawal"
        />
        <ResultBox
          label="Trad + invested tax savings"
          value={fmt(result.tradEquivalent)}
          tone={result.winner !== "Roth" ? "win" : "neutral"}
          sub="Apples-to-apples cash outlay"
        />
      </div>

      <div className="rounded-lg border border-border bg-bg-elevated p-3 text-sm text-text-secondary leading-relaxed">
        <p>
          <span className="font-semibold text-text-primary">{result.winner}</span>{" "}
          wins by{" "}
          <span className="font-mono text-text-primary">
            {fmt(Math.abs(result.diffEquivalent))}
          </span>{" "}
          on the apples-to-apples comparison.
        </p>
        <p className="mt-2 text-xs text-text-muted">
          Rule of thumb: if your retirement bracket will be{" "}
          <em>lower</em> than today&apos;s, Traditional usually wins. If it&apos;ll be{" "}
          <em>equal or higher</em>, Roth usually wins. Neither model accounts for
          state taxes, RMD effects on Social Security taxation, or IRMAA.
        </p>
      </div>

      <EducationalDisclaimer variant="compact" />
    </Card>
  );
}

function ResultBox({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "win" | "neutral";
}) {
  const toneClass =
    tone === "win"
      ? "border-accent/30 bg-accent/10"
      : "border-border bg-bg-secondary";
  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
        {label}
      </p>
      <p className="mt-1 text-lg font-mono font-semibold text-text-primary">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-text-muted">{sub}</p>}
    </div>
  );
}
