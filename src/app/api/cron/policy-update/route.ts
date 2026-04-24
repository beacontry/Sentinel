import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { policyItems } from "@/lib/db/schema";
import { fetchAllPolicyFeeds, classifySectors, classifyStatus } from "@/lib/policy-rss";
import { sql } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("cron-policy-update");

// ─── Static seed data (inserted once on first run) ──────────────────

const SEED_DATA = [
  { title: "CLARITY Act (Crypto Regulation)", status: "committee", summary: "Establishes a comprehensive regulatory framework for digital assets, defining which tokens are securities vs. commodities and assigning oversight to the SEC and CFTC respectively.", affectedSectors: ["Crypto", "Fintech", "Banking"], sourceUrl: null, lastUpdated: new Date("2025-11-20") },
  { title: "SEC Climate Disclosure Rules", status: "enacted", summary: "Requires publicly traded companies to disclose climate-related financial risks, greenhouse gas emissions data, and transition plans in annual filings.", affectedSectors: ["Energy", "Industrials", "Materials", "Utilities"], sourceUrl: null, lastUpdated: new Date("2025-06-01") },
  { title: "Stock Buyback Excise Tax Increase", status: "proposed", summary: "Proposes increasing the 1% excise tax on corporate stock buybacks to 4%, aiming to encourage companies to reinvest profits.", affectedSectors: ["Technology", "Healthcare", "Financials"], sourceUrl: null, lastUpdated: new Date("2025-09-15") },
  { title: "Digital Asset Reporting Requirements", status: "enacted", summary: "Mandates that cryptocurrency exchanges and brokers report customer transactions to the IRS via Form 1099-DA.", affectedSectors: ["Crypto", "Fintech"], sourceUrl: null, lastUpdated: new Date("2025-01-01") },
  { title: "Insider Trading Reform Act", status: "committee", summary: "Codifies insider trading prohibitions into federal law, clarifies the definition of material nonpublic information, and increases penalties for violations.", affectedSectors: ["All Sectors"], sourceUrl: null, lastUpdated: new Date("2025-07-22") },
  { title: "Payment for Order Flow Ban", status: "proposed", summary: "Prohibits broker-dealers from receiving payment for routing retail customer orders to market makers.", affectedSectors: ["Brokerage", "Market Making", "Retail Trading"], sourceUrl: null, lastUpdated: new Date("2025-10-05") },
  { title: "AI in Financial Markets Oversight Act", status: "proposed", summary: "Requires SEC registration of AI-driven trading systems, mandates algorithmic risk assessments, and establishes guardrails for autonomous trading decisions.", affectedSectors: ["Technology", "Quantitative Trading", "Hedge Funds"], sourceUrl: null, lastUpdated: new Date("2025-12-01") },
  { title: "Retirement Security Enhancement Act", status: "passed", summary: "Increases 401(k) contribution limits, expands catch-up contributions for workers over 50, and adds tax incentives for employers.", affectedSectors: ["Asset Management", "Insurance", "Retirement Planning"], sourceUrl: null, lastUpdated: new Date("2025-08-30") },
  { title: "Equity Market Structure Modernization", status: "committee", summary: "Overhauls equity market structure rules including tick-size reforms, enhanced best-execution standards, and updated access fee caps.", affectedSectors: ["Exchanges", "Brokerage", "Market Making"], sourceUrl: null, lastUpdated: new Date("2025-11-10") },
  { title: "CBDC Anti-Surveillance Act", status: "passed", summary: "Prohibits the Federal Reserve from issuing a central bank digital currency directly to individuals.", affectedSectors: ["Banking", "Crypto", "Fintech"], sourceUrl: null, lastUpdated: new Date("2025-05-15") },
];

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check if DB has any items — seed if empty
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(policyItems);

    if (Number(countResult?.count) === 0) {
      await db.insert(policyItems).values(
        SEED_DATA.map((d) => ({
          title: d.title,
          status: d.status,
          summary: d.summary,
          affectedSectors: d.affectedSectors,
          sourceUrl: d.sourceUrl,
          lastUpdated: d.lastUpdated,
        }))
      );
      log.info({ count: SEED_DATA.length }, "Seeded initial policy data");
    }

    // Fetch RSS feeds
    const entries = await fetchAllPolicyFeeds();

    if (entries.length === 0) {
      log.info("No new policy entries from feeds");
      return NextResponse.json({ status: "ok", newItems: 0, total: Number(countResult?.count) });
    }

    // Check existing titles to avoid duplicates
    const existing = await db
      .select({ title: policyItems.title })
      .from(policyItems);
    const existingTitles = new Set(existing.map((e) => e.title.toLowerCase().slice(0, 80)));

    // Insert new entries
    let inserted = 0;
    for (const entry of entries) {
      const titleKey = entry.title.toLowerCase().slice(0, 80);
      if (existingTitles.has(titleKey)) continue;

      const sectors = classifySectors(entry.title, entry.summary);
      const status = classifyStatus(entry.title, entry.summary);

      await db.insert(policyItems).values({
        title: entry.title.slice(0, 300),
        status,
        summary: entry.summary,
        affectedSectors: sectors,
        sourceUrl: entry.sourceUrl || null,
        lastUpdated: new Date(entry.publishedAt),
      });

      existingTitles.add(titleKey);
      inserted++;
    }

    // Get updated count
    const [updatedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(policyItems);

    log.info({ inserted, total: Number(updatedCount?.count) }, "Policy update complete");

    return NextResponse.json({
      status: "ok",
      newItems: inserted,
      total: Number(updatedCount?.count),
      feedEntries: entries.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Policy update error");
    return NextResponse.json({ error: "Policy update failed" }, { status: 500 });
  }
}
