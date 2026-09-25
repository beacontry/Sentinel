"use client";

import { Check, ChevronDown, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hasLoaded, type LoadState } from "@/lib/trader-view";
import { DeskPanel } from "./desk-panel";

/**
 * Optional risk overrides (an empty field means the engine decides).
 * Rendering only: the page loads the stored profile, diffs and saves it,
 * and pushes the set overrides to a running engine.
 *
 * The fields stay disabled until the stored profile has loaded, so a
 * Save can never send a blank form over stored values. The panel folds
 * away (remembered per browser by the page) because it is set-and-forget.
 */

export const RISK_FIELDS = [
  {
    key: "accountSize",
    label: "Account Size ($)",
    placeholder: "Engine default: 10,000",
    step: "100",
    help: "Your starting capital. Drives position sizing — a $5K account with 10% max position takes $500 trades.",
  },
  {
    key: "maxDailyLossPct",
    label: "Max Daily Loss (%)",
    placeholder: "Engine default: 2%",
    step: "0.1",
    help: "Engine halts for the day if losses exceed this. 1–2% is conservative; >3% is aggressive.",
  },
  {
    key: "maxDrawdownPct",
    label: "Max Drawdown (%)",
    placeholder: "Engine default: 10%",
    step: "0.5",
    help: "How much your account can drop from peak before exposure rules kick in. Higher = tolerates bigger swings.",
  },
  {
    key: "maxPositionPct",
    label: "Max Position (%)",
    placeholder: "Engine default: 15%",
    step: "0.5",
    help: "Largest single trade as % of equity. 10–15% = diversified; 25%+ = concentrated. Live trading: keep ≤10%.",
  },
  {
    key: "maxPositionSize",
    label: "Max Position Size (shares)",
    placeholder: "Engine default: 100",
    step: "1",
    help: "Hard cap on shares per order. Prevents oversized fills on cheap stocks (e.g. a $1 stock with 10% position = 1000 shares without this).",
  },
  {
    key: "maxSingleTradeLoss",
    label: "Max Single Trade Loss ($)",
    placeholder: "Engine default: 100",
    step: "10",
    help: "Informational only — the engine sizes by % but you can use this as a sanity ceiling.",
  },
  {
    key: "maxExposureMultiplier",
    label: "Max Exposure (× equity)",
    placeholder: "Engine default: 1.5×",
    step: "0.1",
    help: "Sum of all open positions as a multiple of equity. 1.0× = no leverage, 1.5× = mild margin use. Stay ≤1.0× on a cash account.",
  },
  {
    key: "trailActivationProfitPct",
    label: "Trail activation (peak % above entry)",
    placeholder: "Off (recommended: 5)",
    step: "0.5",
    help: "Trailing stop stays dormant until peak rises this far above entry. Fixed disaster stop still active from day 0. Robustness sweep recommends 5%: positive Δreturn on the loser universe in 4/5 periods, on random S&P in 5/5. Leave blank to keep the trail always-active.",
  },
  {
    key: "trailActivationBars",
    label: "Trail activation (delay, days)",
    placeholder: "Off (skip unless tuning)",
    step: "1",
    help: "Trailing stop stays dormant for this many trading days after entry. Less robust than the profit gate per the sweep — surfaced for opt-in tuning only. Leave blank or 0 for default.",
  },
  {
    key: "maxSectorExposurePct",
    label: "Max sector exposure (% of equity)",
    placeholder: "Off (e.g. 30)",
    step: "1",
    help: "Blocks a BUY that would push any one sector (Technology, Financials, ...) above this % of equity, capping single-sector concentration. Leave blank to disable.",
  },
  {
    key: "earningsBlackoutDays",
    label: "Earnings blackout (days)",
    placeholder: "Off (e.g. 5)",
    step: "1",
    help: "Blocks new BUYs within this many calendar days of a symbol's earnings release, avoiding event-risk gaps. Leave blank or 0 to disable.",
  },
] as const;

interface RiskOverridesPanelProps {
  open: boolean;
  onToggleOpen: () => void;
  form: Record<string, string>;
  onField: (key: string, value: string) => void;
  load: LoadState;
  onRetry: () => void;
  saving: boolean;
  saved: boolean;
  saveError: string | null;
  /** Save is allowed: loaded, something changed, and no command in flight. */
  canSave: boolean;
  onSave: () => void;
}

export function RiskOverridesPanel({
  open,
  onToggleOpen,
  form,
  onField,
  load,
  onRetry,
  saving,
  saved,
  saveError,
  canSave,
  onSave,
}: RiskOverridesPanelProps) {
  const loaded = hasLoaded(load);
  const set = RISK_FIELDS.filter((f) => (form[f.key] ?? "") !== "").length;
  return (
    <DeskPanel
      id="trader-risk"
      title="Risk overrides"
      description={
        loaded
          ? `${set === 0 ? "None set" : `${set} of ${RISK_FIELDS.length} set`}. Empty fields use the engine defaults.`
          : "Empty fields use the engine defaults."
      }
      controls={
        <Button variant="ghost" size="sm" onClick={onToggleOpen} aria-expanded={open} aria-controls="trader-risk-fields">
          {open ? "Hide" : "Edit"}
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </Button>
      }
    >
      <div id="trader-risk-fields" hidden={!open}>
        {load.status === "error" && !loaded && (
          <div role="alert" className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-bearish">
            <span>{load.error} Saving is off until they load, so nothing is overwritten.</span>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        )}
        <div className="space-y-4" aria-busy={load.status === "loading" || undefined}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {RISK_FIELDS.map(({ key, label, placeholder, step, help }) => (
              <div key={key}>
                <Input
                  label={label}
                  help={help}
                  type="number"
                  inputMode="decimal"
                  step={step}
                  min="0"
                  value={form[key]}
                  placeholder={placeholder}
                  onChange={(e) => onField(key, e.target.value)}
                  disabled={!loaded || saving}
                  className="font-mono"
                />
                {form[key] === "" && loaded && <span className="mt-0.5 block text-xs text-text-muted">Engine decides</span>}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" loading={saving} onClick={onSave} disabled={!canSave}>
              Save overrides
            </Button>
            <p role="status" className="text-sm text-bullish">
              {saved && (
                <span className="inline-flex items-center gap-1">
                  <Check className="h-4 w-4" aria-hidden="true" /> Saved
                </span>
              )}
            </p>
            {saveError && (
              <p role="alert" className="text-sm text-bearish">
                {saveError}
              </p>
            )}
          </div>
        </div>
      </div>
    </DeskPanel>
  );
}
