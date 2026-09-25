"use client";

import type { ReactNode } from "react";
import { Play, RefreshCw, Square, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { SignedPercent, SignedValue } from "@/components/ui/signed-value";
import { StatusChip } from "@/components/ui/status-chip";
import { PRESET_LABELS } from "@/lib/strategy-presets";
import type { EngineStatus } from "./types";
import { timeAgo } from "./types";

/**
 * The engine panel: what the engine is doing, which mode it runs in, and
 * the commands. Rendering only; the page owns the commands, the halt
 * confirmation and the picker state.
 *
 * The mode picker is a Segmented control seeded by the page from the
 * running engine's mode. Stop stays its own action while the engine runs;
 * Switch appears only when the picker names another mode. Halt sits apart
 * from the others, in the destructive tone, because it liquidates.
 *
 * Every button prints its word on every breakpoint: the old icon-only
 * phone buttons had no accessible name.
 */

/**
 * The selectable modes. conservative / moderate / aggressive stay in the
 * engine enum for the adaptive classifier, but users pick adaptive rather
 * than one of those directly.
 */
export const ENGINE_MODE_OPTIONS: { value: string; label: string; description: string }[] = [
  ...(["optimized", "tactical", "tactical-smart"] as const).map((key) => ({
    value: key,
    label: PRESET_LABELS[key].label,
    description: PRESET_LABELS[key].description,
  })),
  { value: "adaptive", label: "Adaptive", description: "Auto-switches based on VIX + SPY regime" },
];

/** The options, plus a running legacy mode the picker no longer offers, so it still shows as chosen. */
export function modeOptionsFor(mode: string): typeof ENGINE_MODE_OPTIONS {
  if (ENGINE_MODE_OPTIONS.some((m) => m.value === mode)) return ENGINE_MODE_OPTIONS;
  const preset = PRESET_LABELS[mode as keyof typeof PRESET_LABELS];
  return [
    ...ENGINE_MODE_OPTIONS,
    { value: mode, label: preset?.label ?? mode, description: preset?.description ?? "No longer offered for a new start" },
  ];
}

function modeLabel(mode: string | undefined | null): string {
  if (!mode) return "unknown mode";
  return ENGINE_MODE_OPTIONS.find((m) => m.value === mode)?.label ?? PRESET_LABELS[mode as keyof typeof PRESET_LABELS]?.label ?? mode;
}

interface EngineControlsProps {
  /** Null when the engine status could not be read. */
  engine: EngineStatus | null;
  pickerMode: string;
  onPickMode: (mode: string) => void;
  controls: { start: boolean; stop: boolean; switchTo: boolean };
  /** The command in flight, if any; every button waits for it. */
  pending: string | null;
  /** Start needs a reachable broker. */
  canStart: boolean;
  /** The engine heartbeat, shown when no scan has run yet. */
  lastHeartbeat: string | null;
  /** A safeguard halted trading for the day while the engine itself is not halted. */
  tradingHalted: boolean;
  onStart: () => void;
  onSwitch: () => void;
  onStop: () => void;
  onHalt: () => void;
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-mono text-text-primary tabular-nums">{children}</dd>
    </div>
  );
}

function EngineState({ engine }: { engine: EngineStatus | null }) {
  if (!engine) return <StatusChip>Status unknown</StatusChip>;
  if (engine.running) {
    return (
      <StatusChip tone="bullish" icon={<Play className="h-3 w-3" />}>
        Running, {modeLabel(engine.mode)}
      </StatusChip>
    );
  }
  if (engine.halted) {
    return (
      <StatusChip tone="bearish" icon={<XCircle className="h-3 w-3" />}>
        Halted
      </StatusChip>
    );
  }
  return <StatusChip icon={<Square className="h-3 w-3" />}>Stopped</StatusChip>;
}

function AdaptiveRegime({ engine }: { engine: EngineStatus }) {
  if (engine.mode !== "adaptive") return null;
  const r = engine.adaptiveRegime;
  if (!r || !engine.effectiveMode) {
    return engine.running ? (
      <p className="text-xs text-text-muted">Adaptive: the regime is computed on the next scan.</p>
    ) : null;
  }
  const spyVsMa50 = r.spyMA50 > 0 ? ((r.spyPrice - r.spyMA50) / r.spyMA50) * 100 : null;
  return (
    <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <Meta label="Adaptive, now">{modeLabel(engine.effectiveMode)}</Meta>
      <Meta label="VIX">{r.vix.toFixed(1)}</Meta>
      {spyVsMa50 !== null && (
        <Meta label="SPY vs SMA50">
          <SignedPercent value={spyVsMa50} glyph={false} />
        </Meta>
      )}
      <div className="flex items-center gap-1.5">
        <dt className="sr-only">Regime</dt>
        <dd>
          {r.regime === "risk_on" ? (
            <StatusChip tone="bullish" icon="▲">Risk on</StatusChip>
          ) : r.regime === "risk_off" ? (
            <StatusChip tone="bearish" icon="▼">Risk off</StatusChip>
          ) : (
            <StatusChip tone="warning">Neutral</StatusChip>
          )}
        </dd>
      </div>
    </dl>
  );
}

export function EngineControls({
  engine,
  pickerMode,
  onPickMode,
  controls,
  pending,
  canStart,
  lastHeartbeat,
  tradingHalted,
  onStart,
  onSwitch,
  onStop,
  onHalt,
}: EngineControlsProps) {
  const options = modeOptionsFor(pickerMode);
  const picked = options.find((m) => m.value === pickerMode);
  const busy = pending !== null;
  const lossStreak = engine?.consecutiveLosses ?? 0;

  return (
    <section
      aria-labelledby="engine-heading"
      className="rounded-xl border border-border bg-bg-secondary p-4 shadow-card lg:p-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="engine-heading" className="text-sm font-semibold text-text-primary">
          Engine
        </h2>
        <EngineState engine={engine} />
        {tradingHalted && (
          <StatusChip tone="bearish" icon={<XCircle className="h-3 w-3" />}>
            Trading halted today
          </StatusChip>
        )}
        {engine && (
          <dl className="flex w-full flex-wrap items-baseline gap-x-4 gap-y-1 text-xs sm:ml-auto sm:w-auto">
            {engine.lastScanAt ? (
              <Meta label="Last scan">{timeAgo(engine.lastScanAt)}</Meta>
            ) : (
              lastHeartbeat && <Meta label="Last seen">{timeAgo(lastHeartbeat)}</Meta>
            )}
            {engine.scanCount > 0 && <Meta label="Scans">{engine.scanCount}</Meta>}
            {engine.positionCount > 0 && <Meta label="Tracking">{engine.positionCount}</Meta>}
            {(engine.dailyLoss ?? 0) !== 0 && (
              <Meta label="Day">
                <SignedValue value={Math.round(engine.dailyLoss ?? 0)} />
              </Meta>
            )}
            {lossStreak > 0 && (
              <Meta label="Losing streak">
                <span className="text-warning">{lossStreak}</span>
              </Meta>
            )}
          </dl>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-4 border-t border-[var(--color-hairline-inner)] pt-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p aria-hidden="true" className="eyebrow mb-2 text-text-muted">
            Mode
          </p>
          <Segmented
            label="Engine mode"
            value={pickerMode}
            onChange={onPickMode}
            options={options.map((m) => ({ value: m.value, label: m.label }))}
            twoUpOnPhone
            className="w-full sm:w-auto"
          />
          {picked && <p className="mt-2 text-xs text-text-muted">{picked.description}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
          {controls.start && (
            <Button onClick={onStart} disabled={busy || !canStart} loading={pending === "start"}>
              <Play className="h-4 w-4" aria-hidden="true" />
              Start
            </Button>
          )}
          {controls.switchTo && (
            <Button onClick={onSwitch} disabled={busy} loading={pending === "switch"}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Switch to {modeLabel(pickerMode)}
            </Button>
          )}
          {controls.stop && (
            <Button variant="secondary" onClick={onStop} disabled={busy} loading={pending === "stop"}>
              <Square className="h-4 w-4" aria-hidden="true" />
              Stop
            </Button>
          )}
          <Button variant="destructive" onClick={onHalt} disabled={busy} loading={pending === "halt"} className="sm:ml-4">
            <XCircle className="h-4 w-4" aria-hidden="true" />
            Halt
          </Button>
        </div>
      </div>

      {engine && engine.mode === "adaptive" && (
        <div className="mt-3">
          <AdaptiveRegime engine={engine} />
        </div>
      )}
    </section>
  );
}
