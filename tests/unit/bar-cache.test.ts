/**
 * On-disk bar caches validate what they read and write (WP12, finding #17).
 *
 * market-data's getCachedBars and the optimizer's getCachedData called
 * JSON.parse and cast the result, with a silent catch. A truncated file cost
 * an unlogged refetch; a parseable file of the wrong shape was returned as the
 * cache type, and in the optimizer `cached.bars.length` then threw before any
 * refetch, so the file was never rewritten and the symbol was dropped from
 * every run by Promise.allSettled without a log line. Both caches now read
 * through readJsonCache (parseJson plus a shape predicate, logged discard) and
 * write through writeJsonCache (predicate, then temp file and rename).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { Bar } from "@/types";

const warnings = vi.hoisted(() => [] as Array<{ obj: Record<string, unknown>; msg: string }>);

vi.mock("@/lib/logger", () => {
  const logger = {
    info: () => {},
    debug: () => {},
    error: () => {},
    warn: (obj: Record<string, unknown>, msg: string) => {
      warnings.push({ obj, msg });
    },
  };
  return { logger, createRouteLogger: () => logger };
});

import {
  isCachedBars,
  isOptimizerCachedBars,
  readJsonCache,
  writeJsonCache,
} from "@/lib/bar-cache";

function bars(n: number, startSec = 1_758_600_000): Bar[] {
  return Array.from({ length: n }, (_, i) => ({
    date: new Date((startSec + i * 300) * 1000).toISOString(),
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 1000,
  }));
}

let dir: string;

beforeEach(async () => {
  warnings.length = 0;
  dir = await mkdtemp(join(tmpdir(), "bar-cache-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("shape predicates", () => {
  it("accept the shapes the caches write", () => {
    expect(isCachedBars({ bars: bars(2), fetchedAt: Date.now(), days: 5 })).toBe(true);
    // Files from before `days` existed
    expect(isCachedBars({ bars: bars(2), fetchedAt: Date.now() })).toBe(true);
    expect(isOptimizerCachedBars({ bars: bars(2), fetchedAt: new Date().toISOString(), lastDate: "2026-09-23" })).toBe(true);
  });

  it("reject wrong shapes", () => {
    expect(isOptimizerCachedBars({ data: bars(2) })).toBe(false);
    expect(isCachedBars({ bars: "nope", fetchedAt: 1 })).toBe(false);
    expect(isCachedBars({ bars: bars(2), fetchedAt: "yesterday" })).toBe(false);
    expect(isCachedBars({ bars: [{ date: "x", open: 1 }], fetchedAt: 1 })).toBe(false);
    expect(isCachedBars({ bars: [{ ...bars(1)[0], close: null }], fetchedAt: 1 })).toBe(false);
    expect(isCachedBars(null)).toBe(false);
  });
});

describe("readJsonCache", () => {
  it("a missing file is a quiet miss", async () => {
    expect(await readJsonCache(join(dir, "none.json"), isCachedBars, "ctx")).toBeNull();
    expect(warnings).toHaveLength(0);
  });

  it("corrupt, truncated and wrong-shape files are misses, each logged", async () => {
    const good = JSON.stringify({ bars: bars(30), fetchedAt: Date.now(), days: 5 });
    await writeFile(join(dir, "corrupt.json"), "\u0000\u0000garbage");
    await writeFile(join(dir, "truncated.json"), good.slice(0, good.length / 2));
    await writeFile(join(dir, "shape.json"), JSON.stringify({ data: bars(30) }));
    for (const f of ["corrupt.json", "truncated.json", "shape.json"]) {
      expect(await readJsonCache(join(dir, f), isOptimizerCachedBars, `ctx:${f}`)).toBeNull();
    }
    expect(warnings.map((w) => w.obj.context)).toEqual(["ctx:corrupt.json", "ctx:truncated.json", "ctx:shape.json"]);
  });

  it("returns a valid entry", async () => {
    const entry = { bars: bars(3), fetchedAt: "2026-09-23T00:00:00.000Z", lastDate: "2026-09-23" };
    await writeFile(join(dir, "ok.json"), JSON.stringify(entry));
    expect(await readJsonCache(join(dir, "ok.json"), isOptimizerCachedBars, "ctx")).toEqual(entry);
  });
});

describe("writeJsonCache", () => {
  it("writes through a temp file and leaves only the target", async () => {
    const path = join(dir, "AAPL.json");
    await writeFile(path, "old");
    const entry = { bars: bars(3), fetchedAt: Date.now(), days: 5 };
    expect(await writeJsonCache(path, entry, isCachedBars, "ctx")).toBe(true);
    expect(JSON.parse(await readFile(path, "utf-8"))).toEqual(entry);
    expect(await readdir(dir)).toEqual(["AAPL.json"]);
  });

  it("refuses a value that would not pass the read check", async () => {
    const path = join(dir, "bad.json");
    const bad = { bars: [{ date: "x" }], fetchedAt: Date.now() } as unknown as { bars: Bar[]; fetchedAt: number };
    expect(await writeJsonCache(path, bad, isCachedBars, "ctx-write")).toBe(false);
    expect(await readdir(dir)).toEqual([]);
    expect(warnings[0].obj).toMatchObject({ context: "ctx-write" });
  });

  it("a failed write is logged, not thrown, and leaves no temp file", async () => {
    const path = join(dir, "missing-subdir", "x.json");
    const entry = { bars: bars(3), fetchedAt: Date.now(), days: 5 };
    expect(await writeJsonCache(path, entry, isCachedBars, "ctx-fail")).toBe(false);
    expect(warnings.some((w) => w.obj.context === "ctx-fail" && /write failed/.test(w.msg))).toBe(true);
    expect(await readdir(dir)).toEqual([]);
  });
});

describe("market-data bar cache end to end", () => {
  function yahooChart(n: number) {
    const b = bars(n);
    return {
      chart: {
        result: [
          {
            timestamp: b.map((x) => Math.floor(Date.parse(x.date) / 1000)),
            indicators: {
              quote: [
                {
                  open: b.map((x) => x.open),
                  high: b.map((x) => x.high),
                  low: b.map((x) => x.low),
                  close: b.map((x) => x.close),
                  volume: b.map((x) => x.volume),
                },
              ],
            },
          },
        ],
      },
    };
  }

  let fetches = 0;

  async function loadProvider() {
    vi.resetModules();
    vi.stubEnv("CACHE_DIR", dir);
    vi.stubEnv("FINNHUB_API_KEY", "");
    fetches = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        fetches++;
        return { ok: true, status: 200, json: async () => yahooChart(30) } as unknown as Response;
      })
    );
    const mod = await import("@/lib/market-data");
    return mod.getMarketDataProvider();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const cacheFile = () => join(dir, "bar-cache", "AAPL_5m.json");

  it("a wrong-shape file is logged, refetched and rewritten valid", async () => {
    await mkdir(join(dir, "bar-cache"), { recursive: true });
    await writeFile(cacheFile(), JSON.stringify({ data: bars(30), fetchedAt: Date.now() }));
    const provider = await loadProvider();
    const got = await provider.fetchBars("AAPL", 5, "5m");
    expect(got).toHaveLength(30);
    expect(fetches).toBe(1);
    expect(warnings.some((w) => w.obj.context === "bar-cache:AAPL:5m")).toBe(true);
    expect(isCachedBars(JSON.parse(await readFile(cacheFile(), "utf-8")))).toBe(true);
    // The rewritten file now serves the next call without a fetch.
    await provider.fetchBars("AAPL", 5, "5m");
    expect(fetches).toBe(1);
  });

  it("a truncated file is logged and refetched", async () => {
    await mkdir(join(dir, "bar-cache"), { recursive: true });
    const good = JSON.stringify({ bars: bars(30), fetchedAt: Date.now(), days: 5 });
    await writeFile(cacheFile(), good.slice(0, 100));
    const provider = await loadProvider();
    await provider.fetchBars("AAPL", 5, "5m");
    expect(fetches).toBe(1);
    expect(warnings.some((w) => w.obj.context === "bar-cache:AAPL:5m")).toBe(true);
  });

  it("a valid fresh file is served without a fetch", async () => {
    await mkdir(join(dir, "bar-cache"), { recursive: true });
    await writeFile(cacheFile(), JSON.stringify({ bars: bars(30), fetchedAt: Date.now(), days: 5 }));
    const provider = await loadProvider();
    expect(await provider.fetchBars("AAPL", 5, "5m")).toHaveLength(30);
    expect(fetches).toBe(0);
    expect(warnings).toHaveLength(0);
  });
});
