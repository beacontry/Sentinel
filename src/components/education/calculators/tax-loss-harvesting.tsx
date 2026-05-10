"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EducationalDisclaimer } from "@/components/education/educational-disclaimer";

/**
 * Tax-Loss Harvesting estimator.
 *
 * Mechanics:
 *   1. Realized losses (from harvesting) offset realized gains dollar-for-dollar.
 *      Short-term losses first offset short-term gains, long-term losses offset
 *      long-term gains, then any remainder offsets the other category.
 *   2. Excess losses (beyond all gains) offset up to $3,000 of ordinary income
 *      per year ($1,500 if MFS).
 *   3. Anything left carries forward indefinitely.
 *
 * The calculator simplifies by aggregating losses (no S/L split) since most
 * harvesters don't pre-classify. Tax savings from gain offset uses the relevant
 * cap-gains rate; ordinary-income offset uses the marginal income rate.
 */

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

const ORDINARY_OFFSET_CAP = 3000;

export function TaxLossHarvestingCalculator() {
  const [harvestableLosses, setHarvestableLosses] = useState(15000);
  const [shortTermGains, setShortTermGains] = useState(8000);
  const [longTermGains, setLongTermGains] = useState(4000);
  const [marginalRatePct, setMarginalRatePct] = useState(24); // ordinary
  const [ltcgRatePct, setLtcgRatePct] = useState(15); // long-term cap gains

  const result = useMemo(() => {
    let losses = Math.max(0, harvestableLosses);
    let stGain = Math.max(0, shortTermGains);
    let ltGain = Math.max(0, longTermGains);
    const ord = marginalRatePct / 100;
    const ltcg = ltcgRatePct / 100;

    // Apply losses to short-term gains first (taxed at ordinary rates — biggest benefit).
    const stOffset = Math.min(losses, stGain);
    losses -= stOffset;
    stGain -= stOffset;
    const stSavings = stOffset * ord;

    // Then long-term gains.
    const ltOffset = Math.min(losses, ltGain);
    losses -= ltOffset;
    ltGain -= ltOffset;
    const ltSavings = ltOffset * ltcg;

    // Then up to $3,000 against ordinary income.
    const ordOffset = Math.min(losses, ORDINARY_OFFSET_CAP);
    losses -= ordOffset;
    const ordSavings = ordOffset * ord;

    // Remaining carries forward.
    const carryForward = losses;

    const totalSavings = stSavings + ltSavings + ordSavings;
    return {
      stOffset,
      ltOffset,
      ordOffset,
      stSavings,
      ltSavings,
      ordSavings,
      totalSavings,
      carryForward,
    };
  }, [
    harvestableLosses,
    shortTermGains,
    longTermGains,
    marginalRatePct,
    ltcgRatePct,
  ]);

  return (
    <Card className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">
          Tax-Loss Harvesting Estimator
        </h3>
        <p className="text-xs text-text-secondary mt-1">
          Estimate this year&apos;s tax savings from realized losses applied
          against gains and ordinary income. Excess losses carry forward
          indefinitely.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Input
          label="Harvestable losses ($)"
          type="number"
          inputMode="numeric"
          value={harvestableLosses}
          onChange={(e) =>
            setHarvestableLosses(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <Input
          label="Short-term gains realized ($)"
          type="number"
          inputMode="numeric"
          value={shortTermGains}
          onChange={(e) =>
            setShortTermGains(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <Input
          label="Long-term gains realized ($)"
          type="number"
          inputMode="numeric"
          value={longTermGains}
          onChange={(e) =>
            setLongTermGains(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <Input
          label="Marginal income tax rate (%)"
          type="number"
          inputMode="decimal"
          step="0.5"
          value={marginalRatePct}
          onChange={(e) => setMarginalRatePct(Number(e.target.value) || 0)}
        />
        <Input
          label="Long-term cap gains rate (%)"
          type="number"
          inputMode="decimal"
          step="0.5"
          value={ltcgRatePct}
          onChange={(e) => setLtcgRatePct(Number(e.target.value) || 0)}
        />
      </div>

      <div className="rounded-xl border border-accent/30 bg-accent/10 p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
          Estimated current-year tax savings
        </p>
        <p className="mt-1 text-3xl font-mono font-semibold text-text-primary">
          {fmt(result.totalSavings)}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-bg-elevated">
            <tr className="text-left text-text-muted">
              <th className="px-3 py-2 font-medium border-b border-border">
                Application
              </th>
              <th className="px-3 py-2 font-medium border-b border-border text-right">
                Offset
              </th>
              <th className="px-3 py-2 font-medium border-b border-border text-right">
                Tax Savings
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/50">
              <td className="px-3 py-2.5 text-text-secondary">
                Against short-term gains
                <span className="block text-xs text-text-muted">
                  Taxed at ordinary rate — highest benefit
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-text-primary">
                {fmt(result.stOffset)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-bullish">
                {fmt(result.stSavings)}
              </td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="px-3 py-2.5 text-text-secondary">
                Against long-term gains
                <span className="block text-xs text-text-muted">
                  Taxed at LTCG rate
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-text-primary">
                {fmt(result.ltOffset)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-bullish">
                {fmt(result.ltSavings)}
              </td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="px-3 py-2.5 text-text-secondary">
                Against ordinary income (cap $3,000/yr)
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-text-primary">
                {fmt(result.ordOffset)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-bullish">
                {fmt(result.ordSavings)}
              </td>
            </tr>
            <tr>
              <td className="px-3 py-2.5 text-text-secondary">
                Carries forward to future years
                <span className="block text-xs text-text-muted">
                  Unlimited carry, applies same hierarchy each year
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-text-primary">
                {fmt(result.carryForward)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-text-muted">
                Future
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-warning/20 bg-warning/10 p-3 text-xs leading-relaxed text-text-secondary">
        <span className="font-semibold text-text-primary">Wash-sale warning:</span>{" "}
        Buying back the &quot;substantially identical&quot; security within 30
        days before or after the loss sale disallows the loss for that year (it
        adds to the replacement&apos;s cost basis instead). The IRS counts
        purchases in your spouse&apos;s account and your IRA. Common safe swap:
        SPY → VOO is too similar; SPY → VTI (broader index) is generally safe.
      </div>

      <EducationalDisclaimer variant="compact" />
    </Card>
  );
}
