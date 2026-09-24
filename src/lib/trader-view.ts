/**
 * Pure view helpers for the trader dashboard and the order ticket.
 *
 * Client-safe on purpose: no imports from the engine or the database, so the
 * pages can use them and the behaviour can be unit-tested without a browser.
 * (src/lib/trader-client.ts is a server module that imports the engine.)
 */

// ─── Engine status ──────────────────────────────────────────────────

/** Modes the engine accepts, mirroring the POST /api/trader/engine enum. */
export const ENGINE_MODE_VALUES = [
  "conservative",
  "moderate",
  "optimized",
  "aggressive",
  "tactical",
  "tactical-smart",
  "adaptive",
] as const;

export function isEngineMode(v: unknown): v is (typeof ENGINE_MODE_VALUES)[number] {
  return typeof v === "string" && (ENGINE_MODE_VALUES as readonly string[]).includes(v);
}

/**
 * GET /api/trader/engine and every engine command answer `{ data: status }`.
 * One parse path for the poll and the post-command refresh, so neither can
 * store the envelope itself (whose `running` is undefined and reads as
 * Stopped). A bare status object is accepted as well.
 */
export function applyEngineResponse<T extends object>(json: unknown): T | null {
  if (!json || typeof json !== "object") return null;
  if ("data" in json) {
    const wrapped = (json as { data?: unknown }).data;
    return wrapped && typeof wrapped === "object" ? (wrapped as T) : null;
  }
  return json as T;
}

/**
 * The traderStatus heartbeat stores the mode as `env:mode` (paper:adaptive).
 * Returns the mode part when it is a real engine mode, else null.
 */
export function parseStatusMode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const mode = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1) : raw;
  return isEngineMode(mode) ? mode : null;
}

/**
 * The mode a resume should use: the persisted heartbeat mode first (it
 * survives a container restart, which resets the in-memory engine to its
 * default), then the in-memory engine's mode, then the picker.
 */
export function lastKnownMode(
  statusMode: string | null | undefined,
  engineMode: string | null | undefined,
  pickerMode: string,
): string {
  return parseStatusMode(statusMode) ?? (isEngineMode(engineMode) ? engineMode : null) ?? pickerMode;
}

/**
 * The picker follows the engine's mode until the user touches it, so a
 * reload of a page whose engine runs in adaptive shows adaptive rather than
 * the default.
 */
export function syncedPickerMode(
  picker: string,
  touched: boolean,
  engineMode: string | null | undefined,
): string {
  if (touched || !isEngineMode(engineMode)) return picker;
  return engineMode;
}

/**
 * Which engine buttons to show. Stop is always offered while the engine
 * runs; Switch is an extra action, only when the picker names another mode.
 */
export function engineControls(
  engine: { running?: boolean; mode?: string | null } | null,
  pickerMode: string,
): { start: boolean; stop: boolean; switchTo: boolean } {
  const running = engine?.running === true;
  return {
    start: !running,
    stop: running,
    switchTo: running && engine?.mode != null && engine.mode !== pickerMode,
  };
}

// ─── Load state ─────────────────────────────────────────────────────

/**
 * One source's load state. `error` with a non-null lastSuccessAt means the
 * last good data is still on screen but a refresh failed.
 */
export interface LoadState {
  status: "loading" | "ready" | "error";
  lastSuccessAt: number | null;
  error: string | null;
}

export function initialLoadState(): LoadState {
  return { status: "loading", lastSuccessAt: null, error: null };
}

/** A (re)try starts. Data already loaded stays ready while it runs. */
export function loadStarted(s: LoadState): LoadState {
  return s.lastSuccessAt === null ? { ...s, status: "loading", error: null } : s;
}

export function loadSucceeded(_s: LoadState, now: number): LoadState {
  return { status: "ready", lastSuccessAt: now, error: null };
}

/** Always a new object, so each failed poll re-renders the stale marker. */
export function loadFailed(s: LoadState, error: string): LoadState {
  return { status: "error", lastSuccessAt: s.lastSuccessAt, error };
}

/** Whether the source has produced data the user can act on. */
export function hasLoaded(s: LoadState): boolean {
  return s.lastSuccessAt !== null;
}

// ─── Risk overrides form ────────────────────────────────────────────

export const RISK_FORM_KEYS = [
  "accountSize",
  "maxDailyLossPct",
  "maxDrawdownPct",
  "maxPositionPct",
  "maxPositionSize",
  "maxSingleTradeLoss",
  "maxExposureMultiplier",
  "trailActivationProfitPct",
  "trailActivationBars",
  "maxSectorExposurePct",
  "earningsBlackoutDays",
] as const;

export type RiskFormKey = (typeof RISK_FORM_KEYS)[number];

export function emptyRiskForm(): Record<RiskFormKey, string> {
  return Object.fromEntries(RISK_FORM_KEYS.map((k) => [k, ""])) as Record<RiskFormKey, string>;
}

/**
 * The stored profile as form strings. trailActivationProfitPct is stored as
 * a fraction (0.05) and shown as a percent (5); the rest are shown as
 * stored. A null profile means every field is engine-decided.
 */
export function profileToRiskForm(
  profile: Partial<Record<RiskFormKey, number | null>> | null | undefined,
): Record<RiskFormKey, string> {
  const form = emptyRiskForm();
  if (!profile) return form;
  for (const k of RISK_FORM_KEYS) {
    const v = profile[k];
    if (v == null) continue;
    form[k] = String(k === "trailActivationProfitPct" ? v * 100 : v);
  }
  return form;
}

function formValue(k: RiskFormKey, raw: string): number | null | undefined {
  const v = raw.trim();
  if (v === "") return null;
  const num = parseFloat(v);
  if (isNaN(num)) return undefined;
  return k === "trailActivationProfitPct" ? num / 100 : num;
}

/**
 * The PATCH body: only the fields the user changed from the loaded
 * snapshot. A field cleared by the user becomes null (engine decides); a
 * field left alone is not sent, so the route leaves it as stored.
 */
export function diffRiskProfile(
  loaded: Record<string, string>,
  form: Record<string, string>,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const k of RISK_FORM_KEYS) {
    const before = (loaded[k] ?? "").trim();
    const after = (form[k] ?? "").trim();
    if (before === after) continue;
    const v = formValue(k, after);
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

/** The overrides that are set, for the live-engine risk push. */
export function riskFormToEngineParams(form: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of RISK_FORM_KEYS) {
    const v = formValue(k, form[k] ?? "");
    if (v != null) out[k] = v;
  }
  return out;
}

// ─── Tax election (§475(f) MTM) ─────────────────────────────────────

/**
 * PUT body for the MTM checkbox. Notes are never sent (the route leaves
 * them as stored). Re-asserting keeps a prior election year by omitting it;
 * a first election records the current year; unticking clears it.
 */
export function mtmToggleBody(
  next: boolean,
  current: { mtmElectionYear: number | null } | null,
  currentYear: number,
): { hasTraderTaxStatus: boolean; mtmElectionYear?: number | null } {
  if (!next) return { hasTraderTaxStatus: false, mtmElectionYear: null };
  if (current?.mtmElectionYear != null) return { hasTraderTaxStatus: true };
  return { hasTraderTaxStatus: true, mtmElectionYear: currentYear };
}
