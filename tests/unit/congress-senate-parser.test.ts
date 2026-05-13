/**
 * Unit tests for the Senate eFD PTR parser's pure helpers.
 *
 * Doesn't hit the eFD site (session + Akamai flow tested in dev via the
 * actual ingest call). Focuses on the HTML parsing + utility functions
 * so we catch regressions if the form layout shifts.
 */

import { describe, it, expect } from "vitest";
import { internals } from "@/lib/congress-senate-ingester";

describe("congress-senate-parser internals", () => {
  describe("parseUsDate", () => {
    it("converts MM/DD/YYYY to ISO YYYY-MM-DD", () => {
      expect(internals.parseUsDate("12/26/2025")).toBe("2025-12-26");
      expect(internals.parseUsDate("1/2/2024")).toBe("2024-01-02");
    });

    it("returns null on malformed input", () => {
      expect(internals.parseUsDate("foo")).toBeNull();
      expect(internals.parseUsDate("2025-12-26")).toBeNull();
      expect(internals.parseUsDate("")).toBeNull();
    });
  });

  describe("parseAmountRange", () => {
    it("parses the canonical 'min - max' range", () => {
      expect(internals.parseAmountRange("$1,001 - $15,000")).toEqual({ from: 1001, to: 15000 });
      expect(internals.parseAmountRange("$50,001 - $100,000")).toEqual({ from: 50001, to: 100000 });
      expect(internals.parseAmountRange("$250,001 - $500,000")).toEqual({ from: 250001, to: 500000 });
    });

    it("handles whitespace + dash variations", () => {
      expect(internals.parseAmountRange("$1,001-$15,000")).toEqual({ from: 1001, to: 15000 });
    });

    it("returns 0/0 for unparseable inputs (caller can drop)", () => {
      expect(internals.parseAmountRange("Over $50,000,000")).toEqual({ from: 0, to: 0 });
      expect(internals.parseAmountRange("--")).toEqual({ from: 0, to: 0 });
      expect(internals.parseAmountRange("")).toEqual({ from: 0, to: 0 });
    });
  });

  describe("extractReportRef", () => {
    it("extracts UUID + kind from /view/ptr/ links", () => {
      const html = '<a href="/search/view/ptr/abc-123-def-456/" target="_blank">PTR</a>';
      expect(internals.extractReportRef(html)).toEqual({
        kind: "ptr",
        uuid: "abc-123-def-456",
      });
    });

    it("flags paper-filed PTRs distinctly", () => {
      const html = '<a href="/search/view/paper/d44f1b72-5ba8-4d2a-ae6d-e7b1d0c82731/">Paper</a>';
      expect(internals.extractReportRef(html)).toEqual({
        kind: "paper",
        uuid: "d44f1b72-5ba8-4d2a-ae6d-e7b1d0c82731",
      });
    });

    it("returns null on non-matching href", () => {
      expect(internals.extractReportRef('<a href="/somewhere/else/">x</a>')).toBeNull();
    });
  });

  describe("extractCsrfMiddlewareToken", () => {
    it("finds the hidden CSRF input value", () => {
      const html =
        '<form><input type="hidden" name="csrfmiddlewaretoken" value="abc123xyz"></form>';
      expect(internals.extractCsrfMiddlewareToken(html)).toBe("abc123xyz");
    });

    it("returns null when the input is absent", () => {
      expect(internals.extractCsrfMiddlewareToken("<html><body>no form</body></html>")).toBeNull();
    });
  });

  describe("parseSenatePtrHtml", () => {
    const PTR_HTML = `
<html>
<body>
  <h1 class="mb-2">Periodic Transaction Report for 12/26/2025</h1>
  <h2 class="filedReport">Mr. David H McCormick (McCormick, David H.)</h2>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Transaction Date</th><th>Owner</th>
        <th>Ticker</th><th>Asset Name</th><th>Asset Type</th>
        <th>Type</th><th>Amount</th><th>Comment</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>11/28/2025</td>
        <td>Self</td>
        <td>BITB</td>
        <td>Bitwise Bitcoin ETF</td>
        <td>Exchange-Traded Fund</td>
        <td>Purchase</td>
        <td>$50,001 - $100,000</td>
        <td>--</td>
      </tr>
      <tr>
        <td>2</td>
        <td>11/26/2025</td>
        <td>Spouse</td>
        <td>NVDA</td>
        <td>NVIDIA Corporation</td>
        <td>Common Stock</td>
        <td>Sale (Full)</td>
        <td>$15,001 - $50,000</td>
        <td>--</td>
      </tr>
      <tr>
        <td>3</td>
        <td>10/01/2025</td>
        <td>Self</td>
        <td>--</td>
        <td>DELAWARE CNTY PA GO BDS</td>
        <td>Municipal Security</td>
        <td>Purchase</td>
        <td>$250,001 - $500,000</td>
        <td>--</td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;

    it("extracts the filer's normalized name from the parenthesized form", () => {
      const r = internals.parseSenatePtrHtml(PTR_HTML);
      expect(r.filerName).toBe("McCormick, David H.");
    });

    it("extracts the report date from the H1", () => {
      const r = internals.parseSenatePtrHtml(PTR_HTML);
      expect(r.reportDate).toBe("2025-12-26");
    });

    it("returns one transaction per parseable row with a real ticker", () => {
      const r = internals.parseSenatePtrHtml(PTR_HTML);
      expect(r.transactions).toHaveLength(2);
      expect(r.transactions[0]).toMatchObject({
        ticker: "BITB",
        transactionType: "Purchase",
        ownerType: "Self",
        amountFrom: 50001,
        amountTo: 100000,
        transactionDate: "2025-11-28",
      });
      expect(r.transactions[1]).toMatchObject({
        ticker: "NVDA",
        transactionType: "Sale (Full)",
        ownerType: "Spouse",
        amountFrom: 15001,
        amountTo: 50000,
      });
    });

    it("skips rows without a real ticker (municipal bonds, mutual funds with --)", () => {
      const r = internals.parseSenatePtrHtml(PTR_HTML);
      const muni = r.transactions.find((t) => t.assetName.includes("DELAWARE"));
      expect(muni).toBeUndefined();
    });

    it("returns null filerName + empty transactions on empty HTML", () => {
      const r = internals.parseSenatePtrHtml("<html><body></body></html>");
      expect(r.filerName).toBeNull();
      expect(r.transactions).toEqual([]);
    });
  });
});
