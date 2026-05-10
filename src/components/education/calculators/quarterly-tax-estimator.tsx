"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EducationalDisclaimer } from "@/components/education/educational-disclaimer";

/**
 * Quarterly Estimated Tax Calculator (federal only).
 *
 * Computes:
 *   - Estimated 2026 federal tax on YTD income (using 2026 single/MFJ brackets,
 *     LTCG bracketing, and a simplified standard deduction).
 *   - Safe-harbor target (max of: 90% of current-year tax, 100% of prior-year
 *     tax — 110% if prior-year AGI > $150K).
 *   - Required Q4 payment to hit safe-harbor given YTD payments + withholding.
 *
 * Simplifications: ignores AMT, NIIT, state tax, self-employment tax. The
 * point is education, not tax preparation.
 */

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

// 2026 federal brackets (illustrative — verify before relying on this).
const BRACKETS_SINGLE = [
  { upTo: 11_925, rate: 0.10 },
  { upTo: 48_475, rate: 0.12 },
  { upTo: 103_350, rate: 0.22 },
  { upTo: 197_300, rate: 0.24 },
  { upTo: 250_525, rate: 0.32 },
  { upTo: 626_350, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
];

const BRACKETS_MFJ = [
  { upTo: 23_850, rate: 0.10 },
  { upTo: 96_950, rate: 0.12 },
  { upTo: 206_700, rate: 0.22 },
  { upTo: 394_600, rate: 0.24 },
  { upTo: 501_050, rate: 0.32 },
  { upTo: 751_600, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
];

const LTCG_BRACKETS_SINGLE = [
  { upTo: 48_350, rate: 0 },
  { upTo: 533_400, rate: 0.15 },
  { upTo: Infinity, rate: 0.20 },
];

const LTCG_BRACKETS_MFJ = [
  { upTo: 96_700, rate: 0 },
  { upTo: 600_050, rate: 0.15 },
  { upTo: Infinity, rate: 0.20 },
];

const STD_DEDUCTION_SINGLE = 15_000;
const STD_DEDUCTION_MFJ = 30_000;

type FilingStatus = "single" | "mfj";

function applyBrackets(
  amount: number,
  brackets: { upTo: number; rate: number }[],
): number {
  if (amount <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    if (amount <= lower) break;
    const taxableInBand = Math.min(amount, b.upTo) - lower;
    tax += Math.max(0, taxableInBand) * b.rate;
    lower = b.upTo;
  }
  return tax;
}

function estimateFederalTax(
  ordinaryIncome: number,
  shortTermGain: number,
  longTermGain: number,
  filing: FilingStatus,
): number {
  const stdDeduction =
    filing === "single" ? STD_DEDUCTION_SINGLE : STD_DEDUCTION_MFJ;
  const ordBrackets = filing === "single" ? BRACKETS_SINGLE : BRACKETS_MFJ;
  const ltcgBrackets =
    filing === "single" ? LTCG_BRACKETS_SINGLE : LTCG_BRACKETS_MFJ;

  // Ordinary portion: ordinary income + short-term gains (taxed as ordinary).
  // Apply standard deduction to that portion only.
  const ordinaryTaxable = Math.max(0, ordinaryIncome + shortTermGain - stdDeduction);
  const ordinaryTax = applyBrackets(ordinaryTaxable, ordBrackets);

  // LTCG stacks on top of ordinary income for bracketing — see if any falls
  // into the 0% bracket given the ordinary base.
  const ltcgFloor = ordinaryTaxable;
  const ltcg = Math.max(0, longTermGain);
  const ltcgTaxOnFull = applyBrackets(ltcgFloor + ltcg, ltcgBrackets);
  const ltcgTaxOnFloor = applyBrackets(ltcgFloor, ltcgBrackets);
  const ltcgTax = Math.max(0, ltcgTaxOnFull - ltcgTaxOnFloor);

  return ordinaryTax + ltcgTax;
}

export function QuarterlyTaxEstimatorCalculator() {
  const [filing, setFiling] = useState<FilingStatus>("single");
  const [ytdOrdinary, setYtdOrdinary] = useState(80000);
  const [ytdShortTerm, setYtdShortTerm] = useState(40000);
  const [ytdLongTerm, setYtdLongTerm] = useState(15000);
  const [ytdWithheld, setYtdWithheld] = useState(15000);
  const [ytdEstimatesPaid, setYtdEstimatesPaid] = useState(0);
  const [priorYearTax, setPriorYearTax] = useState(28000);
  const [priorYearAgi, setPriorYearAgi] = useState(140000);

  const result = useMemo(() => {
    const currentYearTax = estimateFederalTax(
      ytdOrdinary,
      ytdShortTerm,
      ytdLongTerm,
      filing,
    );

    // Safe-harbor target: lesser of (a) 90% of current-year, (b) 100%/110% of
    // prior-year. Lesser is what the taxpayer needs to satisfy.
    const safe90 = currentYearTax * 0.9;
    const priorYearMultiplier = priorYearAgi > 150_000 ? 1.1 : 1.0;
    const safePrior = priorYearTax * priorYearMultiplier;
    const safeHarborTarget = Math.min(safe90, safePrior);

    const ytdPaid = ytdWithheld + ytdEstimatesPaid;
    const requiredAdditional = Math.max(0, safeHarborTarget - ytdPaid);

    const remainingDue = Math.max(0, currentYearTax - ytdPaid);

    return {
      currentYearTax,
      safe90,
      safePrior,
      safeHarborTarget,
      ytdPaid,
      requiredAdditional,
      remainingDue,
      meetsSafeHarbor: ytdPaid >= safeHarborTarget,
      priorYearMultiplier,
    };
  }, [
    filing,
    ytdOrdinary,
    ytdShortTerm,
    ytdLongTerm,
    ytdWithheld,
    ytdEstimatesPaid,
    priorYearTax,
    priorYearAgi,
  ]);

  return (
    <Card className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">
          Quarterly Estimated Tax Estimator (Federal)
        </h3>
        <p className="text-xs text-text-secondary mt-1">
          Estimates current-year federal tax and shows how much more you need
          to pay to hit safe-harbor and avoid §6654 penalties.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
          Filing status
        </p>
        <div className="flex gap-2">
          {(["single", "mfj"] as FilingStatus[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiling(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filing === f
                  ? "bg-accent/15 text-accent border border-accent/30"
                  : "bg-bg-secondary text-text-secondary border border-border hover:border-border-hover"
              }`}
            >
              {f === "single" ? "Single" : "Married Filing Jointly"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Input
          label="YTD ordinary income ($)"
          type="number"
          inputMode="numeric"
          value={ytdOrdinary}
          onChange={(e) =>
            setYtdOrdinary(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <Input
          label="YTD short-term gains ($)"
          type="number"
          inputMode="numeric"
          value={ytdShortTerm}
          onChange={(e) =>
            setYtdShortTerm(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <Input
          label="YTD long-term gains ($)"
          type="number"
          inputMode="numeric"
          value={ytdLongTerm}
          onChange={(e) =>
            setYtdLongTerm(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <Input
          label="YTD federal withholding ($)"
          type="number"
          inputMode="numeric"
          value={ytdWithheld}
          onChange={(e) =>
            setYtdWithheld(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <Input
          label="YTD estimated payments ($)"
          type="number"
          inputMode="numeric"
          value={ytdEstimatesPaid}
          onChange={(e) =>
            setYtdEstimatesPaid(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <Input
          label="Prior-year total tax ($)"
          type="number"
          inputMode="numeric"
          value={priorYearTax}
          onChange={(e) =>
            setPriorYearTax(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <Input
          label="Prior-year AGI ($)"
          type="number"
          inputMode="numeric"
          value={priorYearAgi}
          onChange={(e) =>
            setPriorYearAgi(Math.max(0, Number(e.target.value) || 0))
          }
        />
      </div>

      {/* Safe-harbor verdict */}
      <div
        className={`rounded-xl border p-4 ${
          result.meetsSafeHarbor
            ? "border-bullish/30 bg-bullish/10"
            : "border-warning/30 bg-warning/10"
        }`}
      >
        {result.meetsSafeHarbor ? (
          <>
            <p className="text-sm font-semibold text-text-primary">
              Safe harbor met — no §6654 penalty risk.
            </p>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">
              You&apos;ve paid{" "}
              <span className="font-mono">{fmt(result.ytdPaid)}</span> against a
              safe-harbor target of{" "}
              <span className="font-mono">
                {fmt(result.safeHarborTarget)}
              </span>
              . You may still owe{" "}
              <span className="font-mono">{fmt(result.remainingDue)}</span> at
              filing — but no penalty.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-text-primary">
              Pay{" "}
              <span className="font-mono">{fmt(result.requiredAdditional)}</span>{" "}
              more by Q4 (Jan 15) to avoid §6654 penalty.
            </p>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">
              Safe-harbor target:{" "}
              <span className="font-mono">{fmt(result.safeHarborTarget)}</span>{" "}
              (lesser of 90% current-year ={" "}
              <span className="font-mono">{fmt(result.safe90)}</span> or{" "}
              {result.priorYearMultiplier === 1.1 ? "110%" : "100%"} of
              prior-year ={" "}
              <span className="font-mono">{fmt(result.safePrior)}</span>). You
              have paid <span className="font-mono">{fmt(result.ytdPaid)}</span>{" "}
              YTD.
            </p>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryBox
          label="Estimated current-year tax"
          value={fmt(result.currentYearTax)}
          sub="Federal only — state, NIIT, AMT not modeled"
        />
        <SummaryBox
          label="Safe-harbor target"
          value={fmt(result.safeHarborTarget)}
          sub={`${result.priorYearMultiplier === 1.1 ? "110%" : "100%"} of prior-year tax floor`}
        />
        <SummaryBox
          label="YTD paid"
          value={fmt(result.ytdPaid)}
          sub="Withholding + estimated payments"
        />
      </div>

      <p className="text-xs text-text-muted leading-relaxed">
        Brackets and standard deduction reflect 2026 figures (single $15,000 /
        MFJ $30,000 standard deduction). Self-employment tax, AMT, NIIT (3.8%
        on investment income above $200K/$250K), and state/local taxes are NOT
        included. State estimated taxes have separate due dates and brackets.
      </p>

      <EducationalDisclaimer variant="compact" />
    </Card>
  );
}

function SummaryBox({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-secondary p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
        {label}
      </p>
      <p className="mt-1 text-lg font-mono font-semibold text-text-primary">
        {value}
      </p>
      <p className="mt-1 text-xs text-text-muted">{sub}</p>
    </div>
  );
}
