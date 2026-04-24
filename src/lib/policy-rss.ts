import { XMLParser } from "fast-xml-parser";
import { createRouteLogger } from "./logger";

const log = createRouteLogger("policy-rss");

// ─── Types ──────────────────────────────────────────────────────────

export interface RawPolicyEntry {
  title: string;
  summary: string;
  sourceUrl: string;
  publishedAt: string;
  source: string;
}

// ─── RSS Feed Definitions ───────────────────────────────────────────

interface FeedConfig {
  name: string;
  url: string;
  parser: (xml: string) => RawPolicyEntry[];
}

const FEEDS: FeedConfig[] = [
  {
    name: "Federal Register — Securities",
    url: "https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bagencies%5D%5B%5D=securities-and-exchange-commission&conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE",
    parser: parseFederalRegisterRSS,
  },
  {
    name: "Federal Register — Treasury",
    url: "https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bagencies%5D%5B%5D=treasury-department&conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE",
    parser: parseFederalRegisterRSS,
  },
  {
    name: "Federal Register — CFTC",
    url: "https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bagencies%5D%5B%5D=commodity-futures-trading-commission&conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE",
    parser: parseFederalRegisterRSS,
  },
  {
    name: "SEC Press Releases",
    url: "https://www.sec.gov/news/pressreleases.rss",
    parser: parseSECRSS,
  },
  {
    name: "SEC Rules",
    url: "https://www.sec.gov/rules/proposed.rss",
    parser: parseSECRSS,
  },
];

// ─── XML Parser ─────────────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: (name) => name === "item" || name === "entry",
});

// ─── Feed Parsers ─────────────────────────────────────────��─────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFederalRegisterRSS(xml: string): RawPolicyEntry[] {
  try {
    const parsed = xmlParser.parse(xml);
    const items = parsed?.rss?.channel?.item ?? [];
    return items.map((item: Record<string, string>) => ({
      title: stripHtml(item.title ?? ""),
      summary: stripHtml(item.description ?? "").slice(0, 500),
      sourceUrl: item.link ?? "",
      publishedAt: item.pubDate ?? new Date().toISOString(),
      source: "Federal Register",
    })).filter((e: RawPolicyEntry) => e.title.length > 0);
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : "parse error" }, "Federal Register parse failed");
    return [];
  }
}

function parseSECRSS(xml: string): RawPolicyEntry[] {
  try {
    const parsed = xmlParser.parse(xml);
    const items = parsed?.rss?.channel?.item ?? [];
    return items.map((item: Record<string, string>) => ({
      title: stripHtml(item.title ?? ""),
      summary: stripHtml(item.description ?? "").slice(0, 500),
      sourceUrl: item.link ?? "",
      publishedAt: item.pubDate ?? new Date().toISOString(),
      source: "SEC",
    })).filter((e: RawPolicyEntry) => e.title.length > 0);
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : "parse error" }, "SEC RSS parse failed");
    return [];
  }
}

// ─── Sector Classification ──────────────────────────────────────────

const SECTOR_KEYWORDS: Record<string, string[]> = {
  "Technology": ["technology", "software", "cyber", "ai ", "artificial intelligence", "algorithm", "digital platform", "data privacy"],
  "Crypto": ["crypto", "digital asset", "bitcoin", "blockchain", "defi", "stablecoin", "token", "cbdc", "virtual currency"],
  "Financials": ["bank", "financial", "lending", "credit", "insurance", "fiduciary", "broker-dealer", "investment adviser"],
  "Energy": ["energy", "oil", "gas", "climate", "carbon", "emission", "renewable", "solar", "wind", "esg"],
  "Healthcare": ["health", "pharmaceutical", "drug", "biotech", "medical", "fda", "clinical"],
  "Consumer": ["consumer", "retail", "e-commerce", "antitrust"],
  "Industrials": ["manufacturing", "infrastructure", "trade", "tariff", "import", "export", "supply chain"],
  "Real Estate": ["real estate", "housing", "mortgage", "reit"],
  "Brokerage": ["broker", "order flow", "execution", "market maker", "exchange", "market structure", "tick size"],
  "Retirement": ["retirement", "401k", "pension", "ira", "annuity"],
};

export function classifySectors(title: string, summary: string): string[] {
  const text = `${title} ${summary}`.toLowerCase();
  const matched = new Set<string>();

  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        matched.add(sector);
        break;
      }
    }
  }

  return matched.size > 0 ? [...matched] : ["General"];
}

// ─── Status Classification ──────────────────────────────────────────

export function classifyStatus(title: string, summary: string): "proposed" | "committee" | "passed" | "enacted" {
  const text = `${title} ${summary}`.toLowerCase();

  if (text.includes("final rule") || text.includes("effective date") || text.includes("enacted") || text.includes("now in effect")) {
    return "enacted";
  }
  if (text.includes("passed") || text.includes("approved by") || text.includes("signed into law")) {
    return "passed";
  }
  if (text.includes("proposed rule") || text.includes("request for comment") || text.includes("advance notice") || text.includes("proposed")) {
    return "proposed";
  }
  return "proposed";
}

// ─── Relevance Filter ───────────────────────────────────────────────

const TRADING_KEYWORDS = [
  "securities", "trading", "market", "exchange", "broker", "investor",
  "fund", "stock", "equity", "bond", "option", "derivative", "swap",
  "crypto", "digital asset", "disclosure", "regulation", "rule",
  "enforcement", "compliance", "fiduciary", "settlement", "clearing",
  "short selling", "margin", "capital", "financial", "tax",
  "ipo", "spac", "esg", "climate", "insider", "fraud",
];

export function isRelevantToTrading(title: string, summary: string): boolean {
  const text = `${title} ${summary}`.toLowerCase();
  return TRADING_KEYWORDS.some((kw) => text.includes(kw));
}

// ─── Main Fetch ─────────────────────────────────────────────────────

export async function fetchAllPolicyFeeds(): Promise<RawPolicyEntry[]> {
  const allEntries: RawPolicyEntry[] = [];

  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(feed.url, {
          signal: controller.signal,
          headers: { "User-Agent": "Sentinel/1.0" },
        });
        if (!res.ok) {
          log.warn({ feed: feed.name, status: res.status }, "Feed fetch failed");
          return [];
        }
        const xml = await res.text();
        return feed.parser(xml);
      } catch (err) {
        log.warn({ feed: feed.name, err: err instanceof Error ? err.message : "unknown" }, "Feed error");
        return [];
      } finally {
        clearTimeout(timeout);
      }
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      allEntries.push(...r.value);
    }
  }

  // Filter to trading-relevant, dedupe by title
  const seen = new Set<string>();
  const filtered: RawPolicyEntry[] = [];
  for (const entry of allEntries) {
    const key = entry.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    if (!isRelevantToTrading(entry.title, entry.summary)) continue;
    seen.add(key);
    filtered.push(entry);
  }

  log.info({ total: allEntries.length, relevant: filtered.length }, "Policy feeds fetched");
  return filtered;
}
