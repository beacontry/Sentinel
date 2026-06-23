/**
 * Senate Periodic Transaction Report ingester — Phase 2.
 *
 * Senate filings live behind the eFD search portal at
 *   https://efdsearch.senate.gov
 *
 * Flow (mirrors what a browser does):
 *  1. GET /search/home/ — sets csrftoken cookie + returns a CSRF middleware
 *     token in a hidden form field.
 *  2. POST /search/home/ with the agreement checkbox + CSRF token —
 *     establishes a session cookie ("agreed to prohibitions" gate).
 *  3. POST /search/report/data/ with report_type=11 (PTR), filter range,
 *     pagination params. Returns DataTables-format JSON: an array of
 *     [first, last, role, html_link, date] tuples. The html_link contains
 *     a UUID that's the report ID.
 *  4. GET /search/view/ptr/{uuid}/ — returns an HTML page with a single
 *     transactions table. Parse via node-html-parser.
 *
 * The Senate site is fronted by Akamai, which is aggressive about flagging
 * non-browser-shaped traffic. We use a realistic UA string + standard
 * browser headers (Accept, Accept-Language, Origin, X-Requested-With for
 * the XHR call). Sequential per-PTR fetches with 500ms pacing keeps us
 * well under any reasonable bot-detection threshold.
 *
 * Paper-filed PTRs (link path is /view/paper/ instead of /view/ptr/) are
 * scanned PDFs — would require OCR to extract transaction data. Skipped
 * for v1 with a debug log.
 *
 * Idempotent — every parsed row upserts via ON CONFLICT DO NOTHING on the
 * congressional_trades_unique constraint.
 */

import { parse as parseHtml } from "node-html-parser";
import { db } from "./db";
import { congressionalTrades } from "./db/schema/congressional-trades";
import { createRouteLogger } from "./logger";

const log = createRouteLogger("congress-senate-ingester");

const BASE = "https://efdsearch.senate.gov";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ─── Types ────────────────────────────────────────────────────────────────

interface SearchResultRow {
  /** Filer first name. */
  first: string;
  /** Filer last name. */
  last: string;
  /** Role / status text from the result row. */
  role: string;
  /** Raw HTML <a> tag containing the report-view link. */
  reportLinkHtml: string;
  /** Filing date as MM/DD/YYYY string. */
  filingDate: string;
}

interface PtrTransaction {
  rowNumber: string;
  transactionDate: string; // ISO YYYY-MM-DD
  ownerType: string;
  ticker: string | null;
  assetName: string;
  assetType: string;
  transactionType: string;
  amountFrom: number;
  amountTo: number;
}

interface ParsedPtr {
  filerName: string | null;
  reportDate: string | null;
  transactions: PtrTransaction[];
}

interface SessionState {
  cookieJar: Map<string, string>;
  csrfToken: string;
}

// ─── Cookie jar helpers ───────────────────────────────────────────────────

/**
 * Tiny cookie store. Built-in fetch doesn't honor `Set-Cookie` across
 * requests; we manage it manually so the agreement-cookie persists.
 *
 * Node 22's Headers has `getSetCookie()` returning each Set-Cookie header
 * as a separate string (the comma-split heuristic on `.get("set-cookie")`
 * is brittle because `Expires` attributes contain commas). Use that
 * primary path with a fallback regex split for older runtimes.
 */
function ingestSetCookies(headers: Headers, jar: Map<string, string>): void {
  const lines =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : ((headers.get("set-cookie") ?? "").split(/, (?=[A-Za-z_-]+=)/));
  for (const line of lines) {
    if (!line) continue;
    const m = line.match(/^\s*([A-Za-z0-9_-]+)=([^;]*)/);
    if (m) jar.set(m[1], m[2]);
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// ─── Session establishment ────────────────────────────────────────────────

/**
 * Reads CSRF middleware token from a Django page's hidden form field.
 * Returns null if the field isn't present (page changed format).
 */
function extractCsrfMiddlewareToken(html: string): string | null {
  const m = html.match(
    /name=["']csrfmiddlewaretoken["']\s+value=["']([^"']+)["']/
  );
  return m ? m[1] : null;
}

async function establishSession(): Promise<SessionState> {
  const jar = new Map<string, string>();

  // Step 1: GET /search/home/ for csrftoken + middleware token
  const homeRes = await fetch(`${BASE}/search/home/`, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9" },
  });
  ingestSetCookies(homeRes.headers, jar);
  const homeHtml = await homeRes.text();
  const initialToken = extractCsrfMiddlewareToken(homeHtml);
  if (!initialToken) {
    throw new Error(
      "Senate eFD home page didn't contain a CSRF middleware token — page format changed"
    );
  }

  // Step 2: POST agreement
  const formBody = new URLSearchParams({
    csrfmiddlewaretoken: initialToken,
    prohibition_agreement: "1",
  }).toString();

  const agreeRes = await fetch(`${BASE}/search/home/`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(jar),
      Referer: `${BASE}/search/home/`,
      Origin: BASE,
    },
    body: formBody,
  });
  ingestSetCookies(agreeRes.headers, jar);

  if (agreeRes.status !== 302) {
    throw new Error(
      `Senate eFD agreement POST returned ${agreeRes.status} (expected 302)`
    );
  }

  // Step 3: GET the search page to refresh the CSRF middleware token for
  // subsequent XHR requests.
  const searchRes = await fetch(`${BASE}/search/`, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: cookieHeader(jar),
    },
  });
  ingestSetCookies(searchRes.headers, jar);
  const searchHtml = await searchRes.text();
  const searchToken = extractCsrfMiddlewareToken(searchHtml);
  if (!searchToken) {
    throw new Error("Senate eFD search page didn't contain CSRF token");
  }

  return { cookieJar: jar, csrfToken: searchToken };
}

// ─── Search ───────────────────────────────────────────────────────────────

/**
 * Query the eFD search endpoint for PTR filings within a date range.
 * Paginates server-side via DataTables-style start/length params.
 */
async function searchPtrs(
  session: SessionState,
  startDate: string, // MM/DD/YYYY
  endDate: string, // MM/DD/YYYY
  options: { maxResults?: number } = {}
): Promise<SearchResultRow[]> {
  const { maxResults = 1000 } = options;
  const results: SearchResultRow[] = [];
  const pageSize = 100;
  let start = 0;
  let draw = 1;

  while (results.length < maxResults) {
    const body = new URLSearchParams();
    body.append("csrfmiddlewaretoken", session.csrfToken);
    // PTR = report_type 11
    body.append("report_type", "11");
    // filer_type=1 = Senator. We could also include 4 (former Senator) but
    // PTRs aren't filed by ex-Senators typically.
    body.append("filer_type", "1");
    body.append("submitted_start_date", `${startDate} 00:00:00`);
    body.append("submitted_end_date", `${endDate} 23:59:59`);
    body.append("first_name", "");
    body.append("last_name", "");
    body.append("candidate_state", "");
    body.append("senator_state", "");
    body.append("office_id", "");
    body.append("draw", String(draw));
    body.append("start", String(start));
    body.append("length", String(pageSize));

    const res = await fetch(`${BASE}/search/report/data/`, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Cookie: cookieHeader(session.cookieJar),
        Origin: BASE,
        Referer: `${BASE}/search/`,
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRFToken": session.csrfToken,
      },
      body: body.toString(),
    });
    ingestSetCookies(res.headers, session.cookieJar);

    if (!res.ok) {
      throw new Error(
        `Senate eFD search returned ${res.status} ${res.statusText}`
      );
    }
    // Guard against Akamai challenge / HTML interstitials: the body may not be
    // JSON. Parse defensively and stop paginating on a non-JSON body instead of
    // letting a SyntaxError abort the whole year's ingest (audit #48).
    const text = await res.text();
    let data: { recordsTotal: number; data: Array<[string, string, string, string, string]> };
    try {
      data = JSON.parse(text);
    } catch {
      log.warn(
        { status: res.status, preview: text.slice(0, 200) },
        "Senate eFD returned a non-JSON body (likely an Akamai challenge) — stopping pagination for this run"
      );
      break;
    }

    if (!data || !Array.isArray(data.data)) break;
    for (const row of data.data) {
      results.push({
        first: row[0],
        last: row[1],
        role: row[2],
        reportLinkHtml: row[3],
        filingDate: row[4],
      });
    }

    if (data.data.length < pageSize || results.length >= data.recordsTotal) {
      break;
    }
    start += pageSize;
    draw += 1;
    // Akamai-friendly pacing between page fetches
    await new Promise((r) => setTimeout(r, 400));
  }

  return results.slice(0, maxResults);
}

// ─── PTR view parser ──────────────────────────────────────────────────────

/**
 * Extract the report UUID from a link like
 *   `<a href="/search/view/ptr/abc-123-uuid/" target="_blank">...</a>`
 *
 * Returns the UUID + a discriminator (`ptr` = electronic, `paper` = scanned
 * PDF, `annual` = annual report not a PTR, etc.).
 */
function extractReportRef(linkHtml: string): { kind: string; uuid: string } | null {
  const m = linkHtml.match(/\/search\/view\/([a-z]+)\/([0-9a-f-]+)\//i);
  return m ? { kind: m[1], uuid: m[2] } : null;
}

/** Parse "$1,001 - $15,000" → { from: 1001, to: 15000 }. Empty/missing → 0/0. */
function parseAmountRange(raw: string): { from: number; to: number } {
  const m = raw.match(/\$([\d,]+)\s*-\s*\$([\d,]+)/);
  if (!m) {
    // Some rows have "Over $50,000,000" or other formats — return 0 as a
    // signal that the row's amount is unparseable. Caller can drop or
    // keep at their discretion.
    return { from: 0, to: 0 };
  }
  return {
    from: Number(m[1].replace(/,/g, "")),
    to: Number(m[2].replace(/,/g, "")),
  };
}

/** "12/17/2025" → "2025-12-17", or null on malformed. */
function parseUsDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/**
 * Parse the PTR HTML view into normalized transactions.
 * The Senate page has a single `<table>` with thead/tbody where each row
 * is one transaction. Header columns:
 *   # | Transaction Date | Owner | Ticker | Asset Name | Asset Type |
 *   Type | Amount | Comment
 */
export function parseSenatePtrHtml(html: string): ParsedPtr {
  const root = parseHtml(html);

  // Filer name lives in <h2 class="filedReport"> — text content has the
  // form "Mr. David H McCormick (McCormick, David H.)" or similar.
  const filerEl = root.querySelector("h2.filedReport");
  let filerName: string | null = null;
  if (filerEl) {
    const raw = filerEl.text.replace(/\s+/g, " ").trim();
    // Pull out the "Last, First" form when present — it's more
    // normalized than the prefixed form.
    const parenMatch = raw.match(/\(([^)]+)\)/);
    if (parenMatch) {
      filerName = parenMatch[1].trim();
    } else {
      filerName = raw;
    }
  }

  // Report date from the H1: "Periodic Transaction Report for 12/26/2025"
  const h1 = root.querySelector("h1");
  let reportDate: string | null = null;
  if (h1) {
    const m = h1.text.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
    if (m) reportDate = parseUsDate(m[1]);
  }

  const transactions: PtrTransaction[] = [];
  const rows = root.querySelectorAll("tbody tr");
  for (const tr of rows) {
    const cells = tr.querySelectorAll("td");
    // Defensive: must have at least the 8 visible columns (Comment may be empty).
    if (cells.length < 8) continue;

    const rowNumber = cells[0].text.trim();
    const txnDateRaw = cells[1].text.trim();
    const owner = cells[2].text.trim();
    const tickerRaw = cells[3].text.trim();
    const assetName = cells[4].text.replace(/\s+/g, " ").trim();
    const assetType = cells[5].text.trim();
    const txnType = cells[6].text.trim();
    const amountRaw = cells[7].text.trim();

    const txnDateIso = parseUsDate(txnDateRaw);
    if (!txnDateIso) continue;

    // Ticker is "--" for assets without one (municipal bonds, mutual funds
    // sometimes, etc.). Skip rows without a real ticker — same policy as
    // the House ingester (no point storing unfilter-able rows).
    const ticker =
      tickerRaw && tickerRaw !== "--" && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(tickerRaw)
        ? tickerRaw.toUpperCase()
        : null;
    if (!ticker) continue;

    const { from, to } = parseAmountRange(amountRaw);

    transactions.push({
      rowNumber,
      transactionDate: txnDateIso,
      ownerType: owner.replace(/\s+/g, " "),
      ticker,
      assetName,
      assetType,
      transactionType: txnType,
      amountFrom: from,
      amountTo: to,
    });
  }

  return { filerName, reportDate, transactions };
}

/** Fetch + parse a single PTR view by UUID. */
async function fetchAndParsePtr(
  session: SessionState,
  uuid: string
): Promise<{ html: string; parsed: ParsedPtr; url: string }> {
  const url = `${BASE}/search/view/ptr/${uuid}/`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: cookieHeader(session.cookieJar),
      Referer: `${BASE}/search/`,
    },
  });
  ingestSetCookies(res.headers, session.cookieJar);
  if (!res.ok) {
    throw new Error(`PTR view returned ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const parsed = parseSenatePtrHtml(html);
  return { html, parsed, url };
}

// ─── Top-level ingester ───────────────────────────────────────────────────

export interface SenateIngestStats {
  year: number;
  searchResults: number;
  ptrsFound: number;
  paperPtrsSkipped: number;
  ptrsParsed: number;
  ptrsFailed: number;
  transactionsExtracted: number;
  transactionsInserted: number;
  transactionsDuplicate: number;
}

/**
 * Ingest one year of Senate PTRs. Idempotent.
 */
export async function ingestSenateYear(
  year: number,
  options: { maxPtrs?: number } = {}
): Promise<SenateIngestStats> {
  const { maxPtrs } = options;
  const stats: SenateIngestStats = {
    year,
    searchResults: 0,
    ptrsFound: 0,
    paperPtrsSkipped: 0,
    ptrsParsed: 0,
    ptrsFailed: 0,
    transactionsExtracted: 0,
    transactionsInserted: 0,
    transactionsDuplicate: 0,
  };

  log.info({ year }, "Senate ingest: establishing session");
  const session = await establishSession();

  const startDate = `01/01/${year}`;
  const endDate = `12/31/${year}`;
  log.info({ year, startDate, endDate }, "Senate ingest: searching");

  const results = await searchPtrs(session, startDate, endDate);
  stats.searchResults = results.length;

  // Filter to electronic PTRs only — paper PDFs need OCR
  const ptrs: { ref: { kind: string; uuid: string }; row: SearchResultRow }[] = [];
  for (const row of results) {
    const ref = extractReportRef(row.reportLinkHtml);
    if (!ref) continue;
    if (ref.kind === "paper") {
      stats.paperPtrsSkipped += 1;
      continue;
    }
    if (ref.kind !== "ptr") continue; // skip annuals, blind trusts, etc.
    ptrs.push({ ref, row });
  }
  stats.ptrsFound = ptrs.length;

  const limit = maxPtrs ?? ptrs.length;
  for (let i = 0; i < Math.min(limit, ptrs.length); i++) {
    const { ref, row } = ptrs[i];
    try {
      const { parsed, url } = await fetchAndParsePtr(session, ref.uuid);
      stats.ptrsParsed += 1;
      stats.transactionsExtracted += parsed.transactions.length;

      if (parsed.transactions.length === 0) continue;

      const filerName =
        parsed.filerName ?? `${row.last.trim()}, ${row.first.trim()}`.replace(/\s+/g, " ");

      const dbRows = parsed.transactions.map((t) => ({
        chamber: "Senate",
        filerName,
        party: null,
        stateDistrict: null,
        transactionDate: t.transactionDate,
        filingDate: parsed.reportDate ?? parseUsDate(row.filingDate),
        ticker: t.ticker!,
        assetDescription: t.assetName + (t.assetType ? ` (${t.assetType})` : ""),
        transactionType: t.transactionType,
        amountFrom: t.amountFrom.toString(),
        amountTo: t.amountTo.toString(),
        ownerType: t.ownerType,
        sourceDocId: ref.uuid,
        sourceUrl: url,
      }));

      const inserted = await db
        .insert(congressionalTrades)
        .values(dbRows)
        .onConflictDoNothing()
        .returning({ id: congressionalTrades.id });
      stats.transactionsInserted += inserted.length;
      stats.transactionsDuplicate += dbRows.length - inserted.length;
    } catch (err) {
      stats.ptrsFailed += 1;
      log.warn(
        {
          uuid: ref.uuid,
          err: err instanceof Error ? err.message : "unknown",
        },
        "Senate PTR fetch/parse failed"
      );
    }

    // 500 ms pacing between PTR fetches — Akamai-friendly
    await new Promise((r) => setTimeout(r, 500));
  }

  log.info(stats, "Senate ingest complete");
  return stats;
}

/**
 * Refresh ingest: pulls current year + (in Jan-Feb) prior year. Mirrors
 * the House refresh pattern.
 */
export async function refreshSenateRecent(): Promise<SenateIngestStats[]> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const years = now.getMonth() < 3 ? [currentYear, currentYear - 1] : [currentYear];

  const results: SenateIngestStats[] = [];
  for (const y of years) {
    try {
      const stats = await ingestSenateYear(y);
      results.push(stats);
    } catch (err) {
      log.error(
        { year: y, err: err instanceof Error ? err.message : "unknown" },
        "Senate year ingest failed"
      );
    }
  }
  return results;
}

// Expose for unit tests
export const internals = {
  parseSenatePtrHtml,
  parseAmountRange,
  parseUsDate,
  extractReportRef,
  extractCsrfMiddlewareToken,
};
