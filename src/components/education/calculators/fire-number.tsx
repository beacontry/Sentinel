"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EducationalDisclaimer } from "@/components/education/educational-disclaimer";

/**
 * FIRE Number / "Can I retire?" calculator.
 *
 * FIRE Number = annual spending in retirement / safe withdrawal rate.
 * Default SWR = 4% (Trinity study, 25× rule). User can adjust 3–5%.
 *
 * Crossover age: simulate current portfolio + monthly savings at the assumed
 * return rate, find first month where balance >= FIRE number.
 *
 * Inflation: spending grows at inflationPct/yr, so FIRE number grows too — we
 * simulate against the inflation-adjusted target.
 */

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

interface CrossoverResult {
  fireNumberToday: number;
  /** Years until crossover; null if never within 60-year horizon. */
  yearsToFire: number | null;
  /** Age at crossover. */
  ageAtFire: number | null;
  /** Final FIRE target at the crossover year (inflation-adjusted). */
  targetAtFire: number;
  /** Series of {year, balance, target} for the chart. */
  series: { year: number; balance: number; target: number }[];
}

function projectFire(
  currentAge: number,
  spending: number,
  swrPct: number,
  currentPortfolio: number,
  monthlySavings: number,
  returnPct: number,
  inflationPct: number,
): CrossoverResult {
  const swr = swrPct / 100;
  const r = returnPct / 100;
  const i = inflationPct / 100;
  const fireToday = spending / swr;

  let balance = currentPortfolio;
  const series: { year: number; balance: number; target: number }[] = [];
  let yearsToFire: number | null = null;
  const horizon = 60;

  for (let year = 1; year <= horizon; year++) {
    // 12 months of contributions + monthly compounding
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + r / 12) + monthlySavings;
    }
    const inflatedTarget = fireToday * Math.pow(1 + i, year);
    series.push({ year, balance, target: inflatedTarget });
    if (yearsToFire === null && balance >= inflatedTarget) {
      yearsToFire = year;
    }
  }

  return {
    fireNumberToday: fireToday,
    yearsToFire,
    ageAtFire: yearsToFire !== null ? currentAge + yearsToFire : null,
    targetAtFire:
      yearsToFire !== null ? series[yearsToFire - 1].target : series[0].target,
    series,
  };
}

export function FireNumberCalculator() {
  const [currentAge, setCurrentAge] = useState(35);
  const [spending, setSpending] = useState(60000);
  const [swrPct, setSwrPct] = useState(4);
  const [currentPortfolio, setCurrentPortfolio] = useState(150000);
  const [monthlySavings, setMonthlySavings] = useState(2000);
  const [returnPct, setReturnPct] = useState(7);
  const [inflationPct, setInflationPct] = useState(3);

  const result = useMemo(
    () =>
      projectFire(
        currentAge,
        spending,
        swrPct,
        currentPortfolio,
        monthlySavings,
        returnPct,
        inflationPct,
      ),
    [
      currentAge,
      spending,
      swrPct,
      currentPortfolio,
      monthlySavings,
      returnPct,
      inflationPct,
    ],
  );

  const seriesMax = Math.max(
    ...result.series.map((s) => Math.max(s.balance, s.target)),
    1,
  );

  return (
    <Card className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">
          FIRE Number — &quot;Can I Retire?&quot;
        </h3>
        <p className="text-xs text-text-secondary mt-1">
          Find your portfolio target and project when you&apos;ll cross it.
          Based on the 4% rule (Trinity study) by default — adjust the safe
          withdrawal rate to your comfort level.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Input
          label="Current age"
          type="number"
          inputMode="numeric"
          value={currentAge}
          onChange={(e) =>
            setCurrentAge(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <Input
          label="Annual retirement spending ($)"
          type="number"
          inputMode="numeric"
          value={spending}
          onChange={(e) => setSpending(Math.max(0, Number(e.target.value) || 0))}
        />
        <Input
          label="Safe withdrawal rate (%)"
          type="number"
          inputMode="decimal"
          step="0.1"
          value={swrPct}
          onChange={(e) =>
            setSwrPct(Math.max(0.1, Number(e.target.value) || 4))
          }
        />
        <Input
          label="Current portfolio ($)"
          type="number"
          inputMode="numeric"
          value={currentPortfolio}
          onChange={(e) =>
            setCurrentPortfolio(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <Input
          label="Monthly savings ($)"
          type="number"
          inputMode="numeric"
          value={monthlySavings}
          onChange={(e) =>
            setMonthlySavings(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <Input
          label="Expected return (%)"
          type="number"
          inputMode="decimal"
          step="0.1"
          value={returnPct}
          onChange={(e) => setReturnPct(Number(e.target.value) || 0)}
        />
        <Input
          label="Inflation (%)"
          type="number"
          inputMode="decimal"
          step="0.1"
          value={inflationPct}
          onChange={(e) => setInflationPct(Number(e.target.value) || 0)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ResultBox
          label="FIRE Number (today's $)"
          value={fmt(result.fireNumberToday)}
          sub={`${spending.toLocaleString()}/yr ÷ ${swrPct}% SWR`}
          tone="neutral"
        />
        <ResultBox
          label="Years to FIRE"
          value={
            result.yearsToFire !== null ? `${result.yearsToFire} yrs` : "60+"
          }
          sub={
            result.ageAtFire !== null
              ? `Age ${result.ageAtFire} at crossover`
              : "Increase savings or returns"
          }
          tone={result.yearsToFire !== null && result.yearsToFire <= 25 ? "win" : "neutral"}
        />
        <ResultBox
          label="Inflation-adjusted target"
          value={
            result.yearsToFire !== null
              ? fmt(result.targetAtFire)
              : fmt(result.fireNumberToday)
          }
          sub={
            result.yearsToFire !== null
              ? `What ${fmt(result.fireNumberToday)} grows to`
              : "(today's $ shown — never reached)"
          }
          tone="neutral"
        />
      </div>

      {/* Trajectory chart */}
      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
          Portfolio vs FIRE target over time
        </p>
        <div className="relative h-24 border-l border-b border-border">
          {result.series.map((s, idx) => {
            const balanceH = (s.balance / seriesMax) * 100;
            const targetH = (s.target / seriesMax) * 100;
            const isFireYear = result.yearsToFire === s.year;
            return (
              <div
                key={idx}
                className="absolute bottom-0 flex flex-col-reverse items-center justify-end"
                style={{
                  left: `${(idx / result.series.length) * 100}%`,
                  width: `${100 / result.series.length}%`,
                  height: "100%",
                }}
              >
                <div
                  className={`w-full ${
                    isFireYear ? "bg-bullish" : "bg-accent/70"
                  } transition-all duration-500`}
                  style={{ height: `${balanceH}%` }}
                  title={`Year ${s.year}: balance ${fmt(s.balance)} / target ${fmt(s.target)}`}
                />
                <div
                  className="absolute h-px w-full bg-warning/60"
                  style={{ bottom: `${targetH}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[10px] text-text-muted">
          <span>Now (age {currentAge})</span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-3 bg-accent rounded-sm" /> Balance
            </span>
            <span className="flex items-center gap-1">
              <span className="h-px w-3 bg-warning" /> Target
            </span>
          </span>
          <span>Age {currentAge + result.series.length}</span>
        </div>
      </div>

      <p className="text-xs text-text-muted leading-relaxed">
        The 4% rule comes from the 1998 Trinity Study covering 1926–1995 U.S.
        market data. It assumes a 50/50 to 75/25 stock/bond mix and a 30-year
        horizon. Longer retirements (40–50 years for FIRE) and recent low-yield
        environments have prompted some researchers to suggest 3.0–3.5% as
        safer. Adjust the SWR up or down to see the effect.
      </p>

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
  const wrapClass =
    tone === "win"
      ? "border-accent/30 bg-accent/10"
      : "border-border bg-bg-secondary";
  return (
    <div className={`rounded-xl border p-3 ${wrapClass}`}>
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
