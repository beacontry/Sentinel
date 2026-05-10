"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EducationalDisclaimer } from "@/components/education/educational-disclaimer";

/**
 * 401(k) Match Optimizer.
 *
 * Most plans match a percentage of pay up to a percentage of pay (e.g., "100%
 * match on the first 4% of pay" or "50% match up to 6%"). The minimum
 * contribution to capture the FULL match equals the match cap percentage.
 *
 * Anything below that cap is leaving free money on the table — every $1 of
 * employee contribution under the cap nets the user $X of employer money.
 *
 * The calculator also projects the long-term value of the foregone match if
 * the user contributes below the cap.
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

export function EmployerMatchOptimizerCalculator() {
  const [salary, setSalary] = useState(80000);
  const [yourContribPct, setYourContribPct] = useState(3);
  const [matchPct, setMatchPct] = useState(100); // employer matches 100% of...
  const [matchCapPct, setMatchCapPct] = useState(4); // ...your contribution up to 4% of pay
  const [years, setYears] = useState(30);
  const [returnPct, setReturnPct] = useState(7);

  const result = useMemo(() => {
    const yourPct = yourContribPct / 100;
    const matchOf = matchPct / 100;
    const matchCap = matchCapPct / 100;
    const r = returnPct / 100;

    const yourContrib = salary * yourPct;
    const matchableEmployeeAmount = Math.min(yourContrib, salary * matchCap);
    const employerCurrent = matchableEmployeeAmount * matchOf;

    // What you'd get if you contributed enough to max the match
    const employerMax = salary * matchCap * matchOf;
    const additionalEmployeeNeeded = Math.max(
      0,
      salary * matchCap - yourContrib,
    );
    const employerForegoneAnnual = employerMax - employerCurrent;

    const totalEmployeeContributionToMaxMatch = salary * matchCap;

    // Long-term value of the foregone match if the gap persists
    const foregoneFV = fv(employerForegoneAnnual, r, years);
    const totalCombinedAtMax = fv(yourContrib + employerMax, r, years);
    const totalCombinedCurrent = fv(yourContrib + employerCurrent, r, years);

    return {
      yourContrib,
      employerCurrent,
      employerMax,
      employerForegoneAnnual,
      additionalEmployeeNeeded,
      totalEmployeeContributionToMaxMatch,
      foregoneFV,
      totalCombinedAtMax,
      totalCombinedCurrent,
      hittingFullMatch: yourPct >= matchCap,
    };
  }, [
    salary,
    yourContribPct,
    matchPct,
    matchCapPct,
    years,
    returnPct,
  ]);

  return (
    <Card className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">
          401(k) Employer Match Optimizer
        </h3>
        <p className="text-xs text-text-secondary mt-1">
          Find the minimum contribution to capture every dollar of employer
          match — usually the highest-return investment available, since match
          dollars are an instant 50–100%+ return.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Input
          label="Annual salary ($)"
          type="number"
          inputMode="numeric"
          value={salary}
          onChange={(e) => setSalary(Math.max(0, Number(e.target.value) || 0))}
        />
        <Input
          label="Your contribution (% of pay)"
          type="number"
          inputMode="decimal"
          step="0.5"
          value={yourContribPct}
          onChange={(e) =>
            setYourContribPct(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Match (%)"
            type="number"
            inputMode="decimal"
            step="5"
            value={matchPct}
            onChange={(e) =>
              setMatchPct(Math.max(0, Number(e.target.value) || 0))
            }
          />
          <Input
            label="Up to (% of pay)"
            type="number"
            inputMode="decimal"
            step="0.5"
            value={matchCapPct}
            onChange={(e) =>
              setMatchCapPct(Math.max(0, Number(e.target.value) || 0))
            }
          />
        </div>
        <Input
          label="Years to retirement"
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
      </div>

      {/* Verdict */}
      <div
        className={`rounded-xl border p-4 ${
          result.hittingFullMatch
            ? "border-bullish/30 bg-bullish/10"
            : "border-warning/30 bg-warning/10"
        }`}
      >
        {result.hittingFullMatch ? (
          <>
            <p className="text-sm font-semibold text-text-primary">
              You&apos;re capturing the full match — well done.
            </p>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">
              Annual employer contribution:{" "}
              <span className="font-mono font-semibold">
                {fmt(result.employerCurrent)}
              </span>
              . Continue contributing at least{" "}
              <span className="font-mono">{matchCapPct}%</span> of pay to keep
              capturing it.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-text-primary">
              You&apos;re leaving{" "}
              <span className="font-mono">
                {fmt(result.employerForegoneAnnual)}/yr
              </span>{" "}
              on the table.
            </p>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">
              Increase your contribution to{" "}
              <span className="font-mono font-semibold">{matchCapPct}%</span> of
              pay (
              <span className="font-mono">
                {fmt(result.totalEmployeeContributionToMaxMatch)}
              </span>
              /yr — about{" "}
              <span className="font-mono">
                {fmt(result.additionalEmployeeNeeded)}
              </span>{" "}
              more than you&apos;re contributing now) to capture the full match.
              Over {years} years at {returnPct}% return, the foregone match
              compounds to{" "}
              <span className="font-mono font-semibold">
                {fmt(result.foregoneFV)}
              </span>
              .
            </p>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SummaryBox
          label="You + Employer (current)"
          primary={fmt(result.totalCombinedCurrent)}
          secondary={`Your contribution today: ${fmt(result.yourContrib)}/yr + employer ${fmt(result.employerCurrent)}/yr`}
          tone={result.hittingFullMatch ? "win" : "neutral"}
        />
        <SummaryBox
          label="You + Employer (at full match)"
          primary={fmt(result.totalCombinedAtMax)}
          secondary={`Hypothetical: ${fmt(result.totalEmployeeContributionToMaxMatch)}/yr + employer ${fmt(result.employerMax)}/yr`}
          tone={result.hittingFullMatch ? "neutral" : "win"}
        />
      </div>

      <p className="text-xs text-text-muted leading-relaxed">
        Common match formulas: 100% on first 3–4% (typical), 50% on first 6%
        (Safe Harbor), 100% on 4% then 50% on next 2% (more generous). Check
        your Summary Plan Description for the exact formula. Vesting schedules
        also matter — match dollars may forfeit if you leave before fully
        vested.
      </p>

      <EducationalDisclaimer variant="compact" />
    </Card>
  );
}

function SummaryBox({
  label,
  primary,
  secondary,
  tone,
}: {
  label: string;
  primary: string;
  secondary: string;
  tone: "win" | "neutral";
}) {
  const wrapClass =
    tone === "win"
      ? "border-accent/30 bg-accent/10"
      : "border-border bg-bg-secondary";
  return (
    <div className={`rounded-xl border p-3 space-y-1 ${wrapClass}`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
        {label}
      </p>
      <p className="text-lg font-mono font-semibold text-text-primary">
        {primary}
      </p>
      <p className="text-xs text-text-muted">{secondary}</p>
    </div>
  );
}
