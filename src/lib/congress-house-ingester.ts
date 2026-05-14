/**
 * House of Representatives Periodic Transaction Report ingester.
 *
 * Pulls bulk disclosures from the official House Clerk source:
 *   https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{YEAR}FD.ZIP
 *
 * Each ZIP contains:
 *   - {YEAR}FD.xml — index of all filings for that year
 *   - {YEAR}FD.txt — same data, TSV
 *
 * The XML lists every member's filings with metadata + DocID. PTR-type
 * filings (FilingType="P") map to PDFs at:
 *   https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/{YEAR}/{DocID}.pdf
 *
 * Each PTR PDF contains 1+ transaction rows. We extract:
 *   asset description, ticker, transaction type (P/S/E),
 *   transaction date, notification (filing) date, amount range.
 *
 * The disclosure form layout has been stable across 2022-2026; the parser
 * matches by the pattern "(TICKER) [TYPE] {P|S|E} MM/DD/YYYY MM/DD/YYYY $X - $Y".
 * Lines that don't match (Treasury bonds with CUSIPs, options with complex
 * descriptions, paper-filed scans that aren't text-extractable) are skipped
 * with a debug log — we don't fail the whole filing on one bad row.
 *
 * Idempotency: every parsed row is upserted with ON CONFLICT DO NOTHING on
 * the congressional_trades_unique constraint. Re-running the ingester is
 * safe — same rows hit the conflict and skip.
 */

import AdmZip from "adm-zip";
import pdfParse from "pdf-parse";
import { XMLParser } from "fast-xml-parser";
import { db } from "./db";
import { congressionalTrades } from "./db/schema/congressional-trades";
import { createRouteLogger } from "./logger";

const log = createRouteLogger("congress-house-ingester");

const USER_AGENT =
  "Mozilla/5.0 (Beacontry-Trading-Intelligence; beacontry.com)";

// ─── XML index types ──────────────────────────────────────────────────────

interface HouseXmlMember {
  Prefix?: string;
  Last: string;
  First: string;
  Suffix?: string;
  /**
   * P=Periodic Transaction Report, C=Original Annual, A=Amendment,
   * T=Termination, X=Extension, W=Withdrawn, D=Deletion, plus a few rarer
   * codes. We only care about P for this table.
   */
  FilingType: string;
  StateDst: string;
  Year: number;
  FilingDate: string; // M/D/YYYY
  DocID: string;
}

// ─── Parser regexes ───────────────────────────────────────────────────────

/**
 * Match a single transaction line within a PTR's text. The form layout
 * produces rows like:
 *
 *   SP    Intuit Inc. - Common Stock (INTU) P  06/20/2025 07/03/2025 $1,001 - $15,000
 *
 * Owner is one of SP/JT/DC (or omitted = Self). Ticker is in parens.
 * Asset type code in brackets ([ST]/[GS]/[OP]/[MF]) follows but is
 * sometimes on the next line — we accept it optionally and ignore it.
 * Transaction type is P / S / E (sometimes "S (partial)" — handled
 * separately by a second pass).
 */
// Literal regex (vs string concatenation) — easier to read AND avoids
// double-escape pitfalls when porting to test scripts. Capture groups:
//   1: owner code (SP/JT/DC/--, optional)
//   2: asset description (lazy)
//   3: ticker
//   4: transaction type (P/S/E)
//   5: transaction date (MM/DD/YYYY)
//   6: notification (filing) date (MM/DD/YYYY)
//   7: amount range lower bound (digits + commas, no $)
//   8: amount range upper bound (digits + commas, no $)
// "(partial)" qualifier presence is detected via a second pass on the
// full match string, not captured here.
//
// Whitespace is `\s*` rather than `\s+` between most fields because
// pdf-parse v1 produces text with adjacent text runs concatenated:
// `S07/28/202508/11/2025$1,001 - $15,000`. The `(?:(SP|JT|DC|--)\s+)?`
// owner prefix still requires whitespace (else "SP" gets confused with
// the start of an asset name).
const TXN_REGEX =
  /(?:(SP|JT|DC|--)\s+)?(.+?)\s*\(([A-Z][A-Z0-9.\-]{0,9})\)\s*(?:\[[A-Z]+\]\s*)?(P|S|E)(?:\s*\(partial\))?\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*\$([\d,]+)\s*-\s*\$([\d,]+)/g;

// Name regex uses `\s*` because pdf-parse v1 strips the space after
// "Name:". So input may be either "Name: Hon. Foo Status:" (v2) or
// "Name:Hon. Foo Status:" (v1).
const NAME_REGEX = /Name:\s*(.+?)\s*Status:/m;
const FILING_ID_REGEX = /Filing ID\s*#?\s*(\d+)/;

// ─── Normalization helpers ────────────────────────────────────────────────

/** "Hon. Robert B. Aderholt" → normalized for the DB filer_name column. */
function normalizeFilerName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Strip form-preamble noise from the captured asset description.
 *
 * The lazy `.+?` in TXN_REGEX matches starting at index 0 of the flat
 * text — which means the FIRST transaction's asset-description capture
 * includes the entire form preamble ("P T R Clerk of the House...
 * Status: Member State/District: AL04 ID Owner Asset Transaction Type
 * Date Notification Date Amount Cap. Gains > $200?"). For subsequent
 * transactions the lazy match starts right after the previous match's
 * end so the asset description is clean.
 *
 * We strip:
 *   - Everything up to and including the form-table header marker
 *     "Cap. Gains > $200?" (or its variants).
 *   - The owner-code letters that get pulled into the description
 *     because they precede the asset name on the form line.
 *   - Trailing/leading whitespace.
 *
 * If the resulting string is empty or > 200 chars, we truncate to the
 * last 80 chars — a real company name is at most ~70 chars.
 */
function sanitizeAssetDescription(raw: string): string {
  let s = raw;

  // 1) Strip the form preamble. The first transaction's lazy match grabs
  //    everything from index 0 of the flat text, including the "P T R
  //    Clerk of the House..." header. The form's table-header tail
  //    "Cap. Gains > $200?" is a reliable cut point.
  const headerCut = s.lastIndexOf("$200?");
  if (headerCut >= 0) s = s.slice(headerCut + "$200?".length);

  // 2) Strip the inter-transaction footer. Between row N and row N+1, the
  //    form prints:
  //      F S : New
  //      S O : <subholding text>
  //    These leak into the next transaction's lazy-matched asset
  //    description. The actual asset name is what follows the LAST
  //    occurrence of these footer markers.
  //
  //    Strategy: find the LAST "F S :" occurrence. Skip past "F S : <word>"
  //    (one token after the colon, typically "New" or "None"), then if
  //    "S O :" follows, skip past that subholding sentence — taking
  //    everything from the first "SP " owner-code or first uppercase-letter
  //    word that doesn't fit the subholding pattern.
  const fsMatch = s.match(/F\s+S\s+:\s+\S+\s*(.*)$/);
  if (fsMatch) {
    let rest = fsMatch[1];
    // Strip leading "S O : <subholding line>" if present. The subholding
    // text ends right before an owner code (SP/JT/DC) followed by the
    // actual asset name, OR before the next clear sentence break.
    // Cut subholding sentence at next owner code (SP/JT/DC/--) which is
    // the form's literal separator between rows. Don't stop at the first
    // capitalized word — the subholding itself often contains capitalized
    // names ("R.W. Allen & Associates, Inc."). pdf-parse v1 may strip the
    // trailing space after the owner code ("SPThermo"), so lookahead only
    // requires the leading whitespace + owner code, not whitespace after.
    const soMatch = rest.match(/^S\s+O\s+:.*?(?=\s(SP|JT|DC|--))/);
    if (soMatch) rest = rest.slice(soMatch[0].length);
    if (rest.trim().length > 0) s = rest;
  }

  // 3) Drop leading owner code if it survived. pdf-parse v1 strips the
  //    space between owner code and asset name, so input may be either
  //    "SP Netflix, Inc." (v2) or "SPNetflix, Inc." (v1) — both leave
  //    an owner code prefix the asset description shouldn't include.
  s = s.replace(/^\s*(SP|JT|DC|--)\s*/, "");

  // 4) Collapse + trim
  s = s.trim().replace(/\s+/g, " ");
  if (s.length > 200) s = "..." + s.slice(-80);
  return s;
}

/** "P" → "Purchase", "S" → "Sale (Full)", "S (partial)" → "Sale (Partial)", "E" → "Exchange". */
function normalizeTxType(code: string, partial: boolean): string {
  if (code === "P") return "Purchase";
  if (code === "S") return partial ? "Sale (Partial)" : "Sale (Full)";
  if (code === "E") return "Exchange";
  return code;
}

/** "SP" → "Spouse", "JT" → "Joint", "DC" → "Dependent Child", default → "Self". */
function normalizeOwner(code: string | null): string {
  if (!code || code === "--") return "Self";
  if (code === "SP") return "Spouse";
  if (code === "JT") return "Joint";
  if (code === "DC") return "Dependent Child";
  return code;
}

/** "07/28/2025" → "2025-07-28" (ISO). Returns null on unparseable input. */
function parseUsDate(s: string): string | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = m[1].padStart(2, "0");
  const day = m[2].padStart(2, "0");
  const year = m[3];
  // Sanity check: month 1-12, day 1-31. Defer fuller validation to PG's
  // DATE type which will reject malformed values at insert time.
  if (Number(month) < 1 || Number(month) > 12) return null;
  if (Number(day) < 1 || Number(day) > 31) return null;
  return `${year}-${month}-${day}`;
}

/** "$1,001" → 1001.00 */
function parseAmount(s: string): number {
  return Number(s.replace(/,/g, ""));
}

// ─── Ticker validation ────────────────────────────────────────────────────

/**
 * Some "tickers" in House filings are actually CUSIPs (9-char alphanumeric)
 * for Treasury bonds, mortgage-backed securities, etc. These aren't useful
 * for the Congress page UI (no real ticker to look up). Skip rows whose
 * extracted "ticker" looks like a CUSIP rather than a stock symbol.
 *
 * Heuristics: real stock tickers are 1-5 chars, all letters (with optional
 * .X suffix for share class). CUSIPs are 9 chars and usually mixed
 * alphanumeric with digits in non-final positions.
 */
function isLikelyStockTicker(ticker: string): boolean {
  if (ticker.length > 6) return false;
  // Treasury common ticker forms are e.g. "91282CJP7" — has digits in the
  // middle. Real stocks: AAPL, BRK.B, BRK.A, GOOGL, GOOG, T.
  if (/^\d/.test(ticker)) return false; // starts with digit = CUSIP
  if (/\d/.test(ticker) && ticker.length > 4) return false; // mid-string digit on a 5+ char string
  return true;
}

// ─── Core parser ──────────────────────────────────────────────────────────

export interface ParsedTransaction {
  ownerType: string;
  assetDescription: string;
  ticker: string;
  transactionType: string;
  transactionDate: string; // ISO
  filingDate: string | null;
  amountFrom: number;
  amountTo: number;
}

export interface ParsedPtr {
  filerName: string | null;
  filingId: string | null;
  transactions: ParsedTransaction[];
}

/** Pull text out of a PTR PDF buffer + parse transaction rows. */
export async function parsePtrPdf(pdfBuffer: Buffer): Promise<ParsedPtr> {
  let text: string;
  try {
    // pdf-parse v1 functional API. We deliberately pinned to v1 because v2
    // pulls a modern pdfjs-dist that depends on DOMMatrix (browser global,
    // missing in Node — fails in the prod Alpine container with
    // "ReferenceError: DOMMatrix is not defined"). v1 ships pdfjs-dist 1.x
    // which has zero DOM dependencies and works in plain Node.
    const result = await pdfParse(pdfBuffer);
    text = result.text;
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : "unknown" },
      "PDF text extraction failed"
    );
    return { filerName: null, filingId: null, transactions: [] };
  }

  // Flatten newlines + NULL bytes + control chars to spaces. The PDF
  // extraction emits embedded NUL characters around form-field markers
  // (e.g. "F\x00\x00\x00\x00\x00 S\x00..." for the "F S :" footer); a
  // plain /\s+/ replace doesn't catch those so the sanitizer's marker
  // patterns fail. Stripping the full ASCII control range fixes it.
  const flat = text.replace(/[\s\x00-\x1f]+/g, " ");

  const nameMatch = flat.match(NAME_REGEX);
  const filerName = nameMatch ? normalizeFilerName(nameMatch[1]) : null;
  const filingIdMatch = flat.match(FILING_ID_REGEX);
  const filingId = filingIdMatch ? filingIdMatch[1] : null;

  const transactions: ParsedTransaction[] = [];

  // Detect "(partial)" presence per match by searching backwards from
  // the match position — simpler than a multi-group regex.
  let match: RegExpExecArray | null;
  TXN_REGEX.lastIndex = 0;
  while ((match = TXN_REGEX.exec(flat)) !== null) {
    const [fullMatch, ownerCode, assetDesc, ticker, txCode, txDate, notifDate, amtFromStr, amtToStr] =
      match;

    if (!isLikelyStockTicker(ticker)) {
      continue; // skip CUSIPs / treasuries
    }

    const txnDateIso = parseUsDate(txDate);
    if (!txnDateIso) continue;
    const filingDateIso = parseUsDate(notifDate);

    // Look at the matched span for "(partial)" qualifier (the regex
    // allows it but doesn't capture it).
    const partial = /\(partial\)/i.test(fullMatch);

    transactions.push({
      ownerType: normalizeOwner(ownerCode ?? null),
      assetDescription: sanitizeAssetDescription(assetDesc),
      ticker: ticker.toUpperCase(),
      transactionType: normalizeTxType(txCode, partial),
      transactionDate: txnDateIso,
      filingDate: filingDateIso,
      amountFrom: parseAmount(amtFromStr),
      amountTo: parseAmount(amtToStr),
    });
  }

  return { filerName, filingId, transactions };
}

// ─── XML index parser ─────────────────────────────────────────────────────

function parseXmlIndex(xmlText: string): HouseXmlMember[] {
  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false, // we want strings for FilingDate consistency
  });
  const data = parser.parse(xmlText) as {
    FinancialDisclosure?: { Member?: HouseXmlMember | HouseXmlMember[] };
  };
  const member = data.FinancialDisclosure?.Member ?? [];
  return Array.isArray(member) ? member : [member];
}

// ─── Network helpers ──────────────────────────────────────────────────────

async function fetchBuffer(url: string, timeoutMs = 30000): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    }
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Top-level ingester ───────────────────────────────────────────────────

export interface IngestStats {
  year: number;
  totalFilings: number;
  ptrFilings: number;
  ptrsParsed: number;
  ptrsFailed: number;
  transactionsExtracted: number;
  transactionsInserted: number;
  transactionsDuplicate: number;
}

/**
 * Ingest one year of House PTR filings. Idempotent — re-running upserts
 * the same rows and silently skips duplicates via the unique constraint.
 *
 * Concurrency-limited: PDFs are fetched in batches of 5 to avoid hammering
 * the House Clerk server. ~500 PDFs/year × ~3s avg = ~5 minutes per year.
 */
export async function ingestHouseYear(
  year: number,
  options: { maxPtrs?: number; concurrency?: number } = {}
): Promise<IngestStats> {
  const { maxPtrs, concurrency = 5 } = options;

  const stats: IngestStats = {
    year,
    totalFilings: 0,
    ptrFilings: 0,
    ptrsParsed: 0,
    ptrsFailed: 0,
    transactionsExtracted: 0,
    transactionsInserted: 0,
    transactionsDuplicate: 0,
  };

  // 1. Download the bulk ZIP
  const zipUrl = `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${year}FD.ZIP`;
  log.info({ year, zipUrl }, "Fetching House FD index ZIP");
  const zipBuffer = await fetchBuffer(zipUrl);

  // 2. Extract the XML index
  const zip = new AdmZip(zipBuffer);
  const xmlEntry = zip.getEntry(`${year}FD.xml`);
  if (!xmlEntry) {
    throw new Error(`${year}FD.xml not found inside ${year}FD.ZIP`);
  }
  const xmlText = xmlEntry.getData().toString("utf8");
  const members = parseXmlIndex(xmlText);
  stats.totalFilings = members.length;
  log.info({ year, totalFilings: members.length }, "House FD index parsed");

  // 3. Filter to PTR-type filings only
  let ptrs = members.filter((m) => m.FilingType === "P" && m.DocID);
  stats.ptrFilings = ptrs.length;
  if (maxPtrs) ptrs = ptrs.slice(0, maxPtrs);
  log.info({ year, ptrCount: stats.ptrFilings, capped: ptrs.length }, "Filtering to PTRs");

  // 4. Fetch + parse PDFs in batches
  for (let i = 0; i < ptrs.length; i += concurrency) {
    const batch = ptrs.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map(async (m) => {
        const pdfUrl = `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${year}/${m.DocID}.pdf`;
        const pdfBuffer = await fetchBuffer(pdfUrl);
        const parsed = await parsePtrPdf(pdfBuffer);
        return { member: m, parsed, pdfUrl };
      })
    );

    for (const result of settled) {
      if (result.status !== "fulfilled") {
        stats.ptrsFailed += 1;
        log.warn(
          { err: result.reason instanceof Error ? result.reason.message : String(result.reason) },
          "PTR fetch/parse failed"
        );
        continue;
      }
      const { member, parsed, pdfUrl } = result.value;
      stats.ptrsParsed += 1;
      stats.transactionsExtracted += parsed.transactions.length;

      if (parsed.transactions.length === 0) continue;

      // Prefer the filer name parsed from the PDF (includes "Hon.", suffix,
      // etc.), fall back to the XML index name.
      const filerName =
        parsed.filerName ??
        `${member.Prefix ?? ""} ${member.First} ${member.Last} ${member.Suffix ?? ""}`
          .replace(/\s+/g, " ")
          .trim();

      const rows = parsed.transactions.map((t) => ({
        chamber: "House",
        filerName,
        party: null,
        stateDistrict: member.StateDst,
        transactionDate: t.transactionDate,
        filingDate: t.filingDate,
        ticker: t.ticker,
        assetDescription: t.assetDescription,
        transactionType: t.transactionType,
        amountFrom: t.amountFrom.toString(),
        amountTo: t.amountTo.toString(),
        ownerType: t.ownerType,
        sourceDocId: member.DocID,
        sourceUrl: pdfUrl,
      }));

      // Idempotent insert. ON CONFLICT DO NOTHING relies on the unique
      // constraint hitting (chamber, filer, txn_date, ticker, type, amount_from).
      try {
        const inserted = await db
          .insert(congressionalTrades)
          .values(rows)
          .onConflictDoNothing()
          .returning({ id: congressionalTrades.id });
        stats.transactionsInserted += inserted.length;
        stats.transactionsDuplicate += rows.length - inserted.length;
      } catch (err) {
        log.error(
          { err: err instanceof Error ? err.message : "unknown", docId: member.DocID },
          "Insert failed"
        );
        stats.ptrsFailed += 1;
      }
    }

    // Gentle pacing to the House Clerk server (avoid getting flagged)
    if (i + concurrency < ptrs.length) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  log.info(stats, "House ingest complete");
  return stats;
}

/**
 * Refresh ingest: pulls only this year + last year. Designed for the daily
 * cron — covers freshly-filed PTRs (which can backdate by up to 45 days
 * across the year boundary).
 */
export async function refreshHouseRecent(): Promise<IngestStats[]> {
  const now = new Date();
  const currentYear = now.getFullYear();
  // In January-February, last year's filings are still trickling in.
  // Always pull both years to cover the boundary.
  const years = now.getMonth() < 3 ? [currentYear, currentYear - 1] : [currentYear];

  const results: IngestStats[] = [];
  for (const y of years) {
    try {
      const stats = await ingestHouseYear(y);
      results.push(stats);
    } catch (err) {
      log.error(
        { year: y, err: err instanceof Error ? err.message : "unknown" },
        "Year ingest failed"
      );
    }
  }
  return results;
}

// Expose for unit tests + the backfill script
export const internals = {
  parseXmlIndex,
  parseUsDate,
  isLikelyStockTicker,
  normalizeTxType,
  normalizeOwner,
  TXN_REGEX,
};
