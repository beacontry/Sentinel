#!/usr/bin/env node
/**
 * Doc staleness check — automation hook #1 + #2 from ~/.claude/patterns-docs.md.
 *
 * 1. BANNED MARKERS: strings that must never appear in CURRENT-TRUTH doc
 *    surfaces (behavior spec + mirror, README, user training, CLAUDE.md).
 *    Each entry is a claim that was true once and got retired/re-tuned —
 *    finding it means a doc is confidently describing dead behavior.
 *    The changelog pair is deliberately EXEMPT: it's dated history and
 *    legitimately contains retired names.
 *
 * 2. ANCHORED COUNTS: "N migrations as of `XXXX_name.sql`" claims are
 *    verified against the newest file in drizzle/ — a newer migration than
 *    the cited anchor means the count is stale.
 *
 * Grows one banned entry per retirement, added in the retiring PR.
 * Run: node scripts/check-doc-staleness.mjs   (CI: blocking, exit 2 on hits)
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

// Current-truth surfaces (from CLAUDE.md § Doc surfaces). Changelog pair exempt.
const SURFACES = [
  "docs/ENGINE_RULESET.md",
  "public/docs/engine-ruleset.html",
  "README.md",
  "public/docs/beacontry-features.html",
  "public/docs/tiers.html",
  "public/docs/usage-slides.html",
  "CLAUDE.md",
];

// [pattern, why it's banned]. Regexes run case-insensitive per line.
const BANNED = [
  [/wash-sale (→|&rarr;) PDT/, "PDT gate retired 2026-06-04 — stale gate-ordering string"],
  [/blocks new BUYs at 3\+ daytrades/, "active PDT blocking removed 2026-06-04"],
  [/SELL\/STRONG_SELL (→|&rarr;) exit position/, "sell signals demoted to stop-tighten 2026-07-15"],
  [/Sell signal received: .*confidence/, "old signal-exit trade-note format — exits no longer fire on signals"],
  [/IBKR Trading Agent|SENTINEL_URL/, "legacy push-agent path removed 2026-05-28"],
  [/Light( is the| \(default|<\/strong> \(default)/, "dark is the default theme since 2026-07-15"],
  [/cooldown.{0,20}3-day window|3-day window.{0,20}cooldown/, "losing-reentry window tuned 3d → 5d on 2026-06-10"],
  [/596 tests|43 suites|46 migrations/, "stale counts from pre-2026-07-14"],
  [/PDT \(Pattern Day Trader\)<\/div>\s*$/, "PDT concept must be marked retired in user docs"],
];

let failures = 0;

for (const rel of SURFACES) {
  let text;
  try {
    text = readFileSync(join(ROOT, rel), "utf8");
  } catch {
    console.error(`MISSING SURFACE: ${rel} — update SURFACES or the CLAUDE.md manifest`);
    failures++;
    continue;
  }
  const lines = text.split("\n");
  for (const [re, why] of BANNED) {
    const rx = new RegExp(re.source, "i");
    lines.forEach((line, i) => {
      if (rx.test(line)) {
        console.error(`${rel}:${i + 1}: banned marker /${re.source}/ — ${why}`);
        console.error(`    ${line.trim().slice(0, 140)}`);
        failures++;
      }
    });
  }
}

// ── Anchored-count check: migration count in CLAUDE.md vs drizzle/ ──────────
const claude = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
const anchors = [...claude.matchAll(/(\d+) migrations as of `(\d{4})_[^`]+`/g)];
const newest = readdirSync(join(ROOT, "drizzle"))
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort()
  .at(-1);
const newestNum = newest?.slice(0, 4);
for (const [, count, cited] of anchors) {
  if (cited !== newestNum) {
    console.error(
      `CLAUDE.md: migration anchor stale — cites ${cited} but newest is ${newest} (update "${count} migrations as of ...")`
    );
    failures++;
  }
}
if (anchors.length === 0) {
  console.error('CLAUDE.md: no "N migrations as of `XXXX_...`" anchor found — the anchored-count convention was removed?');
  failures++;
}

if (failures > 0) {
  console.error(`\n✖ ${failures} doc-staleness finding(s). Fix the doc (or, if the claim became true again, remove the ban entry).`);
  process.exit(2);
}
console.log(`✓ doc staleness check clean (${SURFACES.length} surfaces, ${BANNED.length} banned markers, migration anchor = ${newest})`);
