/**
 * Every /api path a dashboard page fetches has a route file (WP11, finding #34).
 *
 * The order ticket, the watchlists page and replay fetched /api/analyze?symbol=,
 * which never existed; the 404 read as "no data yet", so the ticket had no
 * price or cost estimate, watchlist cards spun forever and replay drew no
 * chart. This scans src/app/dashboard and src/components for fetch() calls
 * with a literal /api path and checks each against the route files under
 * src/app/api. A template interpolation (`${...}`) matches any one segment.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(__dirname, "..", "..");
const API_DIR = join(ROOT, "src", "app", "api");
const SCAN_DIRS = [join(ROOT, "src", "app", "dashboard"), join(ROOT, "src", "components")];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Route patterns as segment arrays, e.g. ["analyze", "[symbol]", "daily"]. */
function routePatterns(): string[][] {
  return walk(API_DIR)
    .filter((f) => /[\\/]route\.(ts|tsx|js)$/.test(f))
    .map((f) => relative(API_DIR, f).split(sep).slice(0, -1));
}

const DYNAMIC = "\u0000"; // stands in for an interpolated segment

/** The path part of a fetched URL literal, as segments after /api/. */
function pathSegments(literal: string): string[] {
  // Collapse interpolations first so a `?` or `/` inside one is not read.
  const collapsed = literal.replace(/\$\{[^}]*\}/g, DYNAMIC);
  const path = collapsed.split(/[?#]/)[0].replace(/^\/api\//, "").replace(/\/$/, "");
  return path.split("/").filter((s) => s.length > 0);
}

function segmentMatches(pattern: string, seg: string): boolean {
  if (/^\[\[?\.\.\./.test(pattern)) return true; // catch-all
  if (pattern.startsWith("[") && pattern.endsWith("]")) return seg.length > 0;
  if (seg.includes(DYNAMIC)) return true; // interpolated: could be anything
  return pattern === seg;
}

function routeExists(segments: string[], patterns: string[][]): boolean {
  return patterns.some((p) => {
    const catchAll = p.length > 0 && /^\[\[?\.\.\./.test(p[p.length - 1]);
    if (!catchAll && p.length !== segments.length) return false;
    if (catchAll && segments.length < p.length - 1) return false;
    return p.every((pat, i) => (i < segments.length ? segmentMatches(pat, segments[i]) : /^\[\[/.test(pat)));
  });
}

function fetchedApiPaths(): Array<{ file: string; literal: string }> {
  const found: Array<{ file: string; literal: string }> = [];
  const re = /fetch\(\s*(["'`])(\/api\/(?:[^"'`$]|\$\{[^}]*\})*)\1/g;
  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir).filter((f) => /\.(tsx?|jsx?)$/.test(f))) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(re)) {
        found.push({ file: relative(ROOT, file).split(sep).join("/"), literal: m[2] });
      }
    }
  }
  return found;
}

// Known dead paths outside this change, listed so the check still catches every
// new one. Remove an entry when its caller is fixed; the last test fails while
// a listed entry no longer reproduces.
//   - strategy-builder POSTs to /api/backtest, which has no route.ts (only
//     backtest/[symbol], compare and mode-compare). Found by this test.
const KNOWN_MISSING = new Set(["src/app/dashboard/strategy-builder/page.tsx: /api/backtest"]);

describe("client fetch paths map to route files (WP11 #34)", () => {
  const patterns = routePatterns();

  it("finds route files and fetch calls to check", () => {
    expect(patterns.length).toBeGreaterThan(50);
    expect(fetchedApiPaths().length).toBeGreaterThan(50);
  });

  it("every dashboard and component fetch('/api/...') has a route", () => {
    const missing = fetchedApiPaths()
      .filter(({ literal }) => !routeExists(pathSegments(literal), patterns))
      .map(({ file, literal }) => `${file}: ${literal}`)
      .filter((entry) => !KNOWN_MISSING.has(entry));
    expect(missing).toEqual([]);
  });

  it("every KNOWN_MISSING entry still reproduces", () => {
    const current = new Set(
      fetchedApiPaths()
        .filter(({ literal }) => !routeExists(pathSegments(literal), patterns))
        .map(({ file, literal }) => `${file}: ${literal}`)
    );
    expect([...KNOWN_MISSING].filter((e) => !current.has(e))).toEqual([]);
  });

  it("the matcher rejects the path the three pages used", () => {
    expect(routeExists(pathSegments("/api/analyze?symbol=${sym}"), patterns)).toBe(false);
    expect(routeExists(pathSegments("/api/analyze/${encodeURIComponent(s)}"), patterns)).toBe(true);
    expect(routeExists(pathSegments("/api/quotes?symbols=${list}"), patterns)).toBe(true);
    expect(routeExists(pathSegments("/api/bars/${s}?days=180"), patterns)).toBe(true);
  });
});
