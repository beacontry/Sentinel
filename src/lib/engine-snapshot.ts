/**
 * Engine state persistence — survives deploys + restarts.
 *
 * Added 2026-05-26 (PR 21b). Before this, only `mode` survived an engine
 * restart (read from trader_status), so every deploy reset:
 *   - dailyLoss / dailyNotional counters     → tripwires re-baseline
 *   - boot equity snapshot                   → account-switch detection blind
 *   - consecutiveLosses                      → auto-halt counter resets
 *   - pendingExits                           → risk of double-sell during restart window
 *   - cooldowns                              → may re-buy a symbol bought 30 min ago
 *   - recentOrderTimestamps                  → rate-limit counter resets
 *   - exitRejectionCount / exitSuppressedUntil → PDT suppression forgotten
 *   - unprotectedSymbols                     → UI banner loses the warning
 *   - positionMap (TrackedPosition map)      → stops/take-profits re-derive from broker
 *
 * Persistence model: one `trader_engine_snapshot` row per user, JSONB payload,
 * written at end of every successful runScan. Hydrated in autoStartIfNeeded
 * when snapshot is younger than SNAPSHOT_MAX_AGE_MS. Older snapshots are
 * discarded — broker is source of truth past that horizon anyway.
 *
 * The serialize/deserialize functions handle Map/Set/Date → JSON conversion
 * explicitly so a downstream JSON.parse() doesn't silently produce {} for
 * what was a Map.
 */

import { db } from "@/lib/db";
import { traderEngineSnapshot } from "@/lib/db/schema/trader";
import { eq, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "engine-snapshot" });

/** Snapshot is treated as fresh when newer than this on autoStartIfNeeded. */
export const SNAPSHOT_MAX_AGE_MS = 60 * 60 * 1000; // 60 min

// ─── Payload shape (versioned) ──────────────────────────────────────────────

/**
 * Snapshot payload version. Bump when shape changes incompatibly so old
 * snapshots are discarded gracefully (deserializeEngineState returns null
 * on version mismatch — engine just boots cold instead of crashing).
 */
export const SNAPSHOT_VERSION = 1;

export interface TrackedPositionSnapshot {
  symbol: string;
  qty: number;
  entryPrice: number;
  peakPrice: number;
  stopLoss: number;
  takeProfit: number;
  trailingStopPct: number;
  entryDate: string; // ISO
  holdPeriod: number;
  currentPrice?: number;
  marketValue?: number;
  atr?: number;
  rsi?: number;
}

export interface EngineSnapshotPayload {
  v: number;
  mode: string;
  dailyLoss: number;
  dailyLossDate: string;
  dailyNotional: number;
  consecutiveLosses: number;
  bootEquitySnapshotDate: string;
  boot: { equity: number; accountNumber: string | null } | null;
  pendingExits: string[];
  cooldowns: Array<[string, number]>;
  recentOrderTimestamps: number[];
  exitRejectionCount: Array<[string, number]>;
  exitSuppressedUntil: Array<[string, number]>;
  unprotectedSymbols: string[];
  positions: TrackedPositionSnapshot[];
}

// ─── Pure serialize / deserialize (testable) ────────────────────────────────

/**
 * Subset of EngineState that the snapshot persists. Kept structural (not
 * importing EngineState) so this module doesn't pull in the entire engine
 * for test purposes.
 */
export interface SerializableEngineFields {
  mode: string;
  dailyLoss: number;
  dailyLossDate: string;
  dailyNotional: number;
  consecutiveLosses: number;
  bootEquitySnapshotDate: string;
  boot: { equity: number; accountNumber: string | null } | null;
  pendingExits: Set<string>;
  cooldowns: Map<string, number>;
  recentOrderTimestamps: number[];
  exitRejectionCount: Map<string, number>;
  exitSuppressedUntil: Map<string, number>;
  unprotectedSymbols: Set<string>;
}

export interface SerializableTrackedPosition {
  symbol: string;
  qty: number;
  entryPrice: number;
  peakPrice: number;
  stopLoss: number;
  takeProfit: number;
  trailingStopPct: number;
  entryDate: Date;
  holdPeriod: number;
  currentPrice?: number;
  marketValue?: number;
  atr?: number;
  rsi?: number;
}

export function serializeEngineState(
  engine: SerializableEngineFields,
  positionMap: Map<string, SerializableTrackedPosition>
): EngineSnapshotPayload {
  return {
    v: SNAPSHOT_VERSION,
    mode: engine.mode,
    dailyLoss: engine.dailyLoss,
    dailyLossDate: engine.dailyLossDate,
    dailyNotional: engine.dailyNotional,
    consecutiveLosses: engine.consecutiveLosses,
    bootEquitySnapshotDate: engine.bootEquitySnapshotDate,
    boot: engine.boot,
    pendingExits: Array.from(engine.pendingExits),
    cooldowns: Array.from(engine.cooldowns.entries()),
    recentOrderTimestamps: [...engine.recentOrderTimestamps],
    exitRejectionCount: Array.from(engine.exitRejectionCount.entries()),
    exitSuppressedUntil: Array.from(engine.exitSuppressedUntil.entries()),
    unprotectedSymbols: Array.from(engine.unprotectedSymbols),
    positions: Array.from(positionMap.values()).map((p) => ({
      symbol: p.symbol,
      qty: p.qty,
      entryPrice: p.entryPrice,
      peakPrice: p.peakPrice,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      trailingStopPct: p.trailingStopPct,
      entryDate: p.entryDate.toISOString(),
      holdPeriod: p.holdPeriod,
      currentPrice: p.currentPrice,
      marketValue: p.marketValue,
      atr: p.atr,
      rsi: p.rsi,
    })),
  };
}

export interface DeserializedSnapshot {
  fields: SerializableEngineFields;
  positions: Map<string, SerializableTrackedPosition>;
}

/**
 * Returns null on version mismatch or shape failure. Caller boots cold
 * (no error) when null is returned — defense against future-schema
 * snapshots and corrupted JSON.
 */
export function deserializeEngineState(raw: unknown): DeserializedSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<EngineSnapshotPayload>;
  if (p.v !== SNAPSHOT_VERSION) {
    log.warn({ found: p.v, expected: SNAPSHOT_VERSION }, "Snapshot version mismatch — discarding");
    return null;
  }
  try {
    const positions = new Map<string, SerializableTrackedPosition>();
    for (const sp of p.positions ?? []) {
      positions.set(sp.symbol, {
        symbol: sp.symbol,
        qty: sp.qty,
        entryPrice: sp.entryPrice,
        peakPrice: sp.peakPrice,
        stopLoss: sp.stopLoss,
        takeProfit: sp.takeProfit,
        trailingStopPct: sp.trailingStopPct,
        entryDate: new Date(sp.entryDate),
        holdPeriod: sp.holdPeriod,
        currentPrice: sp.currentPrice,
        marketValue: sp.marketValue,
        atr: sp.atr,
        rsi: sp.rsi,
      });
    }
    return {
      fields: {
        mode: p.mode ?? "moderate",
        dailyLoss: p.dailyLoss ?? 0,
        dailyLossDate: p.dailyLossDate ?? "",
        dailyNotional: p.dailyNotional ?? 0,
        consecutiveLosses: p.consecutiveLosses ?? 0,
        bootEquitySnapshotDate: p.bootEquitySnapshotDate ?? "",
        boot: p.boot ?? null,
        pendingExits: new Set(p.pendingExits ?? []),
        cooldowns: new Map(p.cooldowns ?? []),
        recentOrderTimestamps: [...(p.recentOrderTimestamps ?? [])],
        exitRejectionCount: new Map(p.exitRejectionCount ?? []),
        exitSuppressedUntil: new Map(p.exitSuppressedUntil ?? []),
        unprotectedSymbols: new Set(p.unprotectedSymbols ?? []),
      },
      positions,
    };
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Snapshot deserialize failed");
    return null;
  }
}

// ─── DB persistence (UPSERT one row per user) ────────────────────────────────

export async function saveEngineSnapshot(
  userId: string,
  payload: EngineSnapshotPayload
): Promise<void> {
  try {
    await db
      .insert(traderEngineSnapshot)
      .values({ userId, payload, snapshotAt: new Date() })
      .onConflictDoUpdate({
        target: traderEngineSnapshot.userId,
        set: { payload, snapshotAt: sql`now()` },
      });
  } catch (err) {
    // Persistence is best-effort. A failed write should NOT kill the scan —
    // worst case the next deploy boots from a slightly older snapshot or
    // cold. Log and move on.
    log.error(
      { userId, err: err instanceof Error ? err.message : "unknown" },
      "Engine snapshot save failed"
    );
  }
}

export interface LoadedSnapshot {
  snapshot: DeserializedSnapshot;
  ageMs: number;
  snapshotAt: Date;
}

/**
 * Read the most recent snapshot for a user. Returns null when:
 *  - no row exists (fresh user, or first deploy after this PR)
 *  - row exists but is older than SNAPSHOT_MAX_AGE_MS (stale → broker resync wins)
 *  - row payload is corrupt or version-mismatched (deserialize returned null)
 *  - DB read fails (logged; caller proceeds with cold boot)
 */
export async function loadEngineSnapshot(userId: string): Promise<LoadedSnapshot | null> {
  try {
    const rows = await db
      .select()
      .from(traderEngineSnapshot)
      .where(eq(traderEngineSnapshot.userId, userId))
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    const ageMs = Date.now() - row.snapshotAt.getTime();
    if (ageMs > SNAPSHOT_MAX_AGE_MS) {
      log.info({ userId, ageMs, maxAgeMs: SNAPSHOT_MAX_AGE_MS }, "Engine snapshot too old — discarding");
      return null;
    }
    const snapshot = deserializeEngineState(row.payload);
    if (!snapshot) return null;
    return { snapshot, ageMs, snapshotAt: row.snapshotAt };
  } catch (err) {
    log.error(
      { userId, err: err instanceof Error ? err.message : "unknown" },
      "Engine snapshot load failed"
    );
    return null;
  }
}
