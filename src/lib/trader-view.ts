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
