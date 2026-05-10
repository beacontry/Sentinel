"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EducationalDisclaimer } from "@/components/education/educational-disclaimer";

/**
 * Universal compound-interest calculator.
 *
 * Inputs: starting balance, monthly contribution, annual return, years.
 * Outputs: final balance, total contributions, total interest.
 *
 * Visualization: simple stacked bar showing principal (starting + contributions)
 * vs interest at the end. We avoid heavyweight charting deps — flat divs sized
 * proportionally are sufficient for "make compounding visible".
 */

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function compute(
  startingBalance: number,
  monthlyContrib: number,
  annualRate: number,
  years: number,
): { final: number; principal: number; interest: number; series: number[] } {
  const r = annualRate / 12;
  const n = years * 12;
  const series: number[] = [];

  let balance = startingBalance;
  for (let m = 1; m <= n; m++) {
    balance = balance * (1 + r) + monthlyContrib;
    if (m % 12 === 0) series.push(balance);
  }

  const principal = startingBalance + monthlyContrib * n;
  const interest = Math.max(0, balance - principal);
  return { final: balance, principal, interest, series };
}

export function CompoundInterestCalculator() {
  const [startingBalance, setStartingBalance] = useState(10000);
  const [monthlyContrib, setMonthlyContrib] = useState(500);
  const [returnPct, setReturnPct] = useState(7);
  const [years, setYears] = useState(30);

  const result = useMemo(
    () => compute(startingBalance, monthlyContrib, returnPct / 100, years),
    [startingBalance, monthlyContrib, returnPct, years],
  );

  const principalPct =
    result.final > 0 ? (result.principal / result.final) * 100 : 0;
  const interestPct = 100 - principalPct;

  const seriesMax = Math.max(...result.series, 1);

  return (
    <Card className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">
          Compound Interest Calculator
        </h3>
        <p className="text-xs text-text-secondary mt-1">
          See how a starting balance plus regular contributions grow when
          returns compound over time.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Input
          label="Starting balance ($)"
          type="number"
          inputMode="numeric"
          value={startingBalance}
          onChange={(e) =>
            setStartingBalance(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <Input
          label="Monthly contribution ($)"
          type="number"
          inputMode="numeric"
          value={monthlyContrib}
          onChange={(e) =>
            setMonthlyContrib(Math.max(0, Number(e.target.value) || 0))
          }
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
          label="Years"
          type="number"
          inputMode="numeric"
          value={years}
          onChange={(e) => setYears(Math.max(0, Number(e.target.value) || 0))}
        />
      </div>

      <div className="rounded-xl border border-accent/30 bg-accent/10 p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
          Final balance after {years} years
        </p>
        <p className="mt-1 text-3xl font-mono font-semibold text-text-primary">
          {fmt(result.final)}
        </p>
      </div>

      {/* Composition bar */}
      <div className="space-y-2">
        <div className="flex h-3 rounded-full overflow-hidden border border-border">
          <div
            className="bg-text-muted/40 transition-all duration-500"
            style={{ width: `${principalPct}%` }}
            aria-label={`Principal ${principalPct.toFixed(0)}%`}
          />
          <div
            className="bg-accent transition-all duration-500"
            style={{ width: `${interestPct}%` }}
            aria-label={`Interest ${interestPct.toFixed(0)}%`}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-sm bg-text-muted/40" />
            <span className="text-text-muted">
              Contributions{" "}
              <span className="font-mono text-text-primary">
                {fmt(result.principal)}
              </span>{" "}
              ({principalPct.toFixed(0)}%)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-sm bg-accent" />
            <span className="text-text-muted">
              Interest{" "}
              <span className="font-mono text-text-primary">
                {fmt(result.interest)}
              </span>{" "}
              ({interestPct.toFixed(0)}%)
            </span>
          </div>
        </div>
      </div>

      {/* Year-by-year sparkline */}
      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
          Balance year by year
        </p>
        <div className="flex items-end gap-0.5 h-20">
          {result.series.map((v, i) => (
            <div
              key={i}
              className="flex-1 bg-accent/60 hover:bg-accent transition-colors rounded-sm min-w-[2px]"
              style={{ height: `${(v / seriesMax) * 100}%` }}
              title={`Year ${i + 1}: ${fmt(v)}`}
            />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-text-muted">
          <span>Year 1</span>
          <span>Year {years}</span>
        </div>
      </div>

      <p className="text-xs text-text-muted leading-relaxed">
        Calculation assumes monthly contributions deposited at month-end and
        compounded monthly. Real returns vary year to year — this projects a
        constant rate, which overstates the smoothness but is fine for showing
        the magnitude of compounding.
      </p>

      <EducationalDisclaimer variant="compact" />
    </Card>
  );
}
