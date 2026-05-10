"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EducationalDisclaimer } from "@/components/education/educational-disclaimer";

/**
 * College funding vehicle comparison.
 * Models monthly contributions across 529, Roth IRA (parent's, used for qualified
 * education), UTMA, and a regular taxable brokerage. End-balance only — withdrawal
 * timing/sequencing is out of scope for the v1 calculator.
 */

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** Monthly contribution future value, contributions at end of month. */
function fvMonthly(monthly: number, annualRate: number, years: number): number {
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return monthly * n;
  return monthly * ((Math.pow(1 + r, n) - 1) / r);
}

/** Approximate annual drag on a taxable account from dividends + turnover. */
const TAXABLE_DRAG = 0.012; // ~1.2%/yr, broad index fund
/** Approximate kiddie-tax drag on a UTMA past the threshold. */
const UTMA_DRAG = 0.018;
/** LTCG on gain at the end (taxable / UTMA basis). */
const LTCG = 0.15;

export function CollegeFundingCompareCalculator() {
  const [monthly, setMonthly] = useState(500);
  const [years, setYears] = useState(18);
  const [returnPct, setReturnPct] = useState(7);
  const [stateDeductionPct, setStateDeductionPct] = useState(5);

  const result = useMemo(() => {
    const r = returnPct / 100;
    const annualContrib = monthly * 12;
    const totalBasis = annualContrib * years;

    // 529: tax-free growth + qualified withdrawal. State deduction modeled as a "bonus" on contributions.
    const fiveTwoNineGross = fvMonthly(monthly, r, years);
    const stateBonus =
      stateDeductionPct > 0
        ? fvMonthly(monthly * (stateDeductionPct / 100), r, years)
        : 0;
    const fiveTwoNine = fiveTwoNineGross + stateBonus;

    // Roth IRA (parent's): tax-free growth, principal accessible, earnings tax-free if 59½ + 5yr.
    // For the college-spending angle, treat as tax-free at withdrawal (same magnitude as 529).
    const roth = fvMonthly(monthly, r, years);

    // UTMA: ~1.8% drag from kiddie tax + LTCG on gain at end.
    const utmaPre = fvMonthly(monthly, r - UTMA_DRAG, years);
    const utmaGain = Math.max(0, utmaPre - totalBasis);
    const utma = utmaPre - utmaGain * 0.15; // approx, kiddie + LTCG combined

    // Taxable brokerage (parent's): ~1.2% drag + LTCG on gain at end.
    const taxablePre = fvMonthly(monthly, r - TAXABLE_DRAG, years);
    const taxableGain = Math.max(0, taxablePre - totalBasis);
    const taxable = taxablePre - taxableGain * LTCG;

    return { fiveTwoNine, roth, utma, taxable, totalBasis };
  }, [monthly, years, returnPct, stateDeductionPct]);

  const rows: { label: string; value: number; note?: string }[] = [
    {
      label: "529 Plan",
      value: result.fiveTwoNine,
      note: stateDeductionPct > 0
        ? `Includes state deduction recycled at ${returnPct}%`
        : "Tax-free growth + qualified withdrawals",
    },
    {
      label: "Parent's Roth IRA",
      value: result.roth,
      note: "Equivalent to 529 if used for qualified expenses",
    },
    {
      label: "UTMA / UGMA",
      value: result.utma,
      note: "Kiddie tax + 20% FAFSA hit not modeled",
    },
    {
      label: "Taxable brokerage",
      value: result.taxable,
      note: "After 1.2% annual drag + 15% LTCG on gain",
    },
  ];

  const max = Math.max(...rows.map((r) => r.value));

  return (
    <Card className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">
          College Funding Vehicle Comparison
        </h3>
        <p className="text-xs text-text-secondary mt-1">
          Projected ending balance by account type. Same monthly contribution,
          same gross return.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Input
          label="Monthly contribution ($)"
          type="number"
          inputMode="numeric"
          value={monthly}
          onChange={(e) => setMonthly(Math.max(0, Number(e.target.value) || 0))}
        />
        <Input
          label="Years until college"
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
          label="State 529 deduction (%)"
          type="number"
          inputMode="decimal"
          step="0.5"
          value={stateDeductionPct}
          onChange={(e) =>
            setStateDeductionPct(Math.max(0, Number(e.target.value) || 0))
          }
        />
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const pct = max > 0 ? (row.value / max) * 100 : 0;
          const isWin = row.value === max;
          return (
            <div key={row.label} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`text-sm ${
                    isWin
                      ? "font-semibold text-text-primary"
                      : "text-text-secondary"
                  }`}
                >
                  {row.label}
                </span>
                <span className="font-mono text-sm font-semibold text-text-primary">
                  {fmt(row.value)}
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-bg-elevated overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                    isWin ? "bg-accent" : "bg-text-muted/40"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {row.note && (
                <p className="text-xs text-text-muted">{row.note}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-bg-elevated p-3 text-xs leading-relaxed text-text-muted">
        Total contributions over the period:{" "}
        <span className="font-mono text-text-primary">
          {fmt(result.totalBasis)}
        </span>
        . Model assumes contributions invested through the entire horizon (no
        glide path). FAFSA impact, state recapture, and scholarship
        contingencies not modeled.
      </div>

      <EducationalDisclaimer variant="compact" />
    </Card>
  );
}
