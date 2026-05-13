/**
 * Backfill script: pulls the House Clerk's full PTR archive for the
 * current year + 2 prior years, parses every PTR PDF, and inserts into
 * the congressional_trades table.
 *
 * Usage:
 *   npx tsx scripts/backfill-congress.ts                  # default years
 *   npx tsx scripts/backfill-congress.ts --years 2025,2024
 *   npx tsx scripts/backfill-congress.ts --max-ptrs 10    # smoke test
 *
 * Idempotent — re-running just upserts the same rows and skips
 * duplicates via the congressional_trades_unique constraint.
 *
 * Expected runtime: ~5 min per year (~500 PTRs × ~3s avg per PDF fetch
 * + parse, batched 5-at-a-time with 250ms pacing between batches).
 */

import { ingestHouseYear } from "@/lib/congress-house-ingester";
import { ingestSenateYear } from "@/lib/congress-senate-ingester";

function parseArgs(): { years: number[]; maxPtrs: number | undefined; chambers: ("House" | "Senate")[] } {
  const args = process.argv.slice(2);
  let years: number[] | null = null;
  let maxPtrs: number | undefined;
  let chambers: ("House" | "Senate")[] = ["House", "Senate"];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--years" && args[i + 1]) {
      years = args[i + 1].split(",").map((y) => parseInt(y.trim(), 10)).filter((y) => !isNaN(y));
      i++;
    } else if (args[i] === "--max-ptrs" && args[i + 1]) {
      maxPtrs = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--chamber" && args[i + 1]) {
      const c = args[i + 1].toLowerCase();
      if (c === "house") chambers = ["House"];
      else if (c === "senate") chambers = ["Senate"];
      i++;
    }
  }

  if (!years || years.length === 0) {
    const now = new Date().getFullYear();
    years = [now, now - 1, now - 2];
  }
  return { years, maxPtrs, chambers };
}

async function main() {
  const { years, maxPtrs, chambers } = parseArgs();
  console.log(`Backfilling ${chambers.join(" + ")} congressional trades for years: ${years.join(", ")}`);
  if (maxPtrs) console.log(`  (max ${maxPtrs} PTRs per year — smoke mode)`);

  for (const year of years) {
    if (chambers.includes("House")) {
      console.log(`\n--- House ${year} ---`);
      try {
        const stats = await ingestHouseYear(year, { maxPtrs });
        console.log(`  Total filings:      ${stats.totalFilings}`);
        console.log(`  PTRs identified:    ${stats.ptrFilings}`);
        console.log(`  PTRs parsed:        ${stats.ptrsParsed}`);
        console.log(`  PTRs failed:        ${stats.ptrsFailed}`);
        console.log(`  Tx extracted:       ${stats.transactionsExtracted}`);
        console.log(`  Tx inserted:        ${stats.transactionsInserted}`);
        console.log(`  Tx duplicates:      ${stats.transactionsDuplicate}`);
      } catch (err) {
        console.error(`  FAILED:`, err instanceof Error ? err.message : err);
      }
    }

    if (chambers.includes("Senate")) {
      console.log(`\n--- Senate ${year} ---`);
      try {
        const stats = await ingestSenateYear(year, { maxPtrs });
        console.log(`  Search results:     ${stats.searchResults}`);
        console.log(`  PTRs found:         ${stats.ptrsFound}`);
        console.log(`  Paper PDFs skipped: ${stats.paperPtrsSkipped}`);
        console.log(`  PTRs parsed:        ${stats.ptrsParsed}`);
        console.log(`  PTRs failed:        ${stats.ptrsFailed}`);
        console.log(`  Tx extracted:       ${stats.transactionsExtracted}`);
        console.log(`  Tx inserted:        ${stats.transactionsInserted}`);
        console.log(`  Tx duplicates:      ${stats.transactionsDuplicate}`);
      } catch (err) {
        console.error(`  FAILED:`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
