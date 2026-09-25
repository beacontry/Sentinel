import { readFile, rename, unlink, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import type { Bar } from "@/types";
import { logger } from "./logger";
import { parseJson } from "./parse-json";

// On-disk bar caches (market-data's per-resolution cache and the optimizer's
// incremental cache). Both read through parseJson with a shape predicate, so a
// truncated file or one of the wrong shape is logged and treated as a miss
// (the caller refetches and rewrites it) instead of being returned cast to the
// cache type. Both write through a temp file and rename, so a process killed
// mid-write leaves the previous file rather than a torn one.

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function isBar(v: unknown): v is Bar {
  if (typeof v !== "object" || v === null) return false;
  const b = v as Record<string, unknown>;
  return (
    typeof b.date === "string" &&
    isFiniteNumber(b.open) &&
    isFiniteNumber(b.high) &&
    isFiniteNumber(b.low) &&
    isFiniteNumber(b.close) &&
    isFiniteNumber(b.volume)
  );
}

function isBarArray(v: unknown): v is Bar[] {
  return Array.isArray(v) && v.every(isBar);
}

/** market-data.ts cache entry. `days` is absent in files written before it existed. */
export interface CachedBars {
  bars: Bar[];
  fetchedAt: number;
  days?: number;
}

export function isCachedBars(v: unknown): v is CachedBars {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return isBarArray(c.bars) && isFiniteNumber(c.fetchedAt) && (c.days === undefined || isFiniteNumber(c.days));
}

/** optimizer.ts incremental cache entry. */
export interface OptimizerCachedBars {
  bars: Bar[];
  fetchedAt: string;
  lastDate: string;
}

export function isOptimizerCachedBars(v: unknown): v is OptimizerCachedBars {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return isBarArray(c.bars) && typeof c.fetchedAt === "string" && typeof c.lastDate === "string";
}

/**
 * Read and validate a JSON cache file. A missing file is an ordinary miss
 * (null, nothing logged); an unreadable, corrupt or wrong-shape file is
 * logged and also returns null.
 */
export async function readJsonCache<T>(
  path: string,
  isValid: (value: unknown) => value is T,
  context: string
): Promise<T | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      logger.warn({ context, err: err instanceof Error ? err.message : "Unknown error" }, "Cache read failed");
    }
    return null;
  }
  return parseJson<T | null>(raw, null, context, isValid as (value: unknown) => value is T | null);
}

/**
 * Validate `value` and write it atomically (temp file in the same directory,
 * then rename). Refuses a value that would not pass the read-side check.
 * Returns whether the file was written; failures are logged, never thrown.
 */
export async function writeJsonCache<T>(
  path: string,
  value: T,
  isValid: (value: unknown) => value is T,
  context: string
): Promise<boolean> {
  if (!isValid(value)) {
    logger.warn({ context }, "Refused to write a cache entry with an unexpected shape");
    return false;
  }
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(value));
    await rename(tmp, path);
    return true;
  } catch (err) {
    logger.warn({ context, err: err instanceof Error ? err.message : "Unknown error" }, "Cache write failed");
    await unlink(tmp).catch((unlinkErr: unknown) => {
      if ((unlinkErr as NodeJS.ErrnoException)?.code !== "ENOENT") {
        logger.warn({ context, err: (unlinkErr as Error).message }, "Could not remove cache temp file");
      }
    });
    return false;
  }
}
