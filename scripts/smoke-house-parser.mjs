// Smoke-test the House PTR parser against real downloaded PDFs.
//
// Runs OUTSIDE the Next.js bundle (plain Node ESM) so we don't pull DB
// imports. We re-implement just enough of the parser inline to validate
// the regex matches against real text — production code stays in
// src/lib/congress-house-ingester.ts.
//
// Run with: node scripts/smoke-house-parser.mjs
//
// Reads PDFs from /tmp/houseFD/ (or %TMP%\houseFD on Windows). Doesn't
// hit any DB. Doesn't ingest anything. Just prints what the parser sees.

import pdfParse from "pdf-parse";
import fs from "fs";
import path from "path";

const TXN_REGEX =
  /(?:(SP|JT|DC|--)\s+)?(.+?)\s*\(([A-Z][A-Z0-9.\-]{0,9})\)\s*(?:\[[A-Z]+\]\s*)?(P|S|E)(?:\s*\(partial\))?\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*\$([\d,]+)\s*-\s*\$([\d,]+)/g;

const NAME_REGEX = /Name:\s*(.+?)\s*Status:/;
const FILING_ID_REGEX = /Filing ID\s*#?\s*(\d+)/;

function sanitizeAssetDescription(raw) {
  let s = raw;
  const headerCut = s.lastIndexOf("$200?");
  if (headerCut >= 0) s = s.slice(headerCut + "$200?".length);
  const fsMatch = s.match(/F\s+S\s+:\s+\S+\s*(.*)$/);
  if (fsMatch) {
    let rest = fsMatch[1];
    const soMatch = rest.match(/^S\s+O\s+:.*?(?=\s(SP|JT|DC|--))/);
    if (soMatch) rest = rest.slice(soMatch[0].length);
    if (rest.trim().length > 0) s = rest;
  }
  s = s.replace(/^\s*(SP|JT|DC|--)\s*/, "");
  s = s.trim().replace(/\s+/g, " ");
  if (s.length > 200) s = "..." + s.slice(-80);
  return s;
}

async function parseFile(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const { text } = await pdfParse(buf);
  {
    const flat = text.replace(/[\s\x00-\x1f]+/g, " ");
    const filer = (flat.match(NAME_REGEX) ?? [])[1] ?? "(unknown)";
    const filingId = (flat.match(FILING_ID_REGEX) ?? [])[1] ?? "(unknown)";

    const txns = [];
    TXN_REGEX.lastIndex = 0;
    let m;
    while ((m = TXN_REGEX.exec(flat)) !== null) {
      txns.push({
        owner: m[1] ?? "Self",
        asset: sanitizeAssetDescription(m[2]).slice(0, 55),
        ticker: m[3],
        type: m[4],
        txnDate: m[5],
        filingDate: m[6],
        amount: `$${m[7]}-$${m[8]}`,
      });
    }
    return { filer, filingId, txns };
  }
}

const TMP = process.env.TMP || "/tmp";
const dir = path.join(TMP, "houseFD");
if (!fs.existsSync(dir)) {
  console.error("No /tmp/houseFD dir — download some PTR PDFs first.");
  process.exit(1);
}

const pdfs = fs.readdirSync(dir).filter((f) => f.endsWith(".pdf"));
if (pdfs.length === 0) {
  console.error("No PDFs in", dir);
  process.exit(1);
}

console.log(`Parsing ${pdfs.length} PDFs from ${dir}\n`);
for (const f of pdfs) {
  try {
    const { filer, filingId, txns } = await parseFile(path.join(dir, f));
    console.log(`=== ${f}  (Filing ID #${filingId}) ===`);
    console.log(`  Filer: ${filer}`);
    console.log(`  Transactions: ${txns.length}`);
    for (const t of txns.slice(0, 8)) {
      console.log(`    ${t.type.padEnd(2)} ${t.ticker.padEnd(7)} ${t.txnDate}  ${t.amount.padEnd(20)} ${t.owner.padEnd(8)} ${t.asset}`);
    }
    if (txns.length > 8) console.log(`    ... and ${txns.length - 8} more`);
    console.log();
  } catch (e) {
    console.error(`!!! ${f}: ${e.message}`);
  }
}
