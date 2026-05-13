/**
 * Unit tests for the House PTR parser's pure helpers.
 *
 * Doesn't hit pdf-parse (binary parsing tested via the smoke script + live
 * data) or the DB. Focuses on the regex + sanitizer logic so we catch
 * format regressions if House Clerk tweaks their form layout.
 */

import { describe, it, expect } from "vitest";
import { internals } from "@/lib/congress-house-ingester";

describe("congress-house-parser internals", () => {
  describe("parseUsDate", () => {
    it("converts MM/DD/YYYY to ISO YYYY-MM-DD", () => {
      expect(internals.parseUsDate("07/28/2025")).toBe("2025-07-28");
      expect(internals.parseUsDate("1/2/2024")).toBe("2024-01-02");
      expect(internals.parseUsDate("12/31/2026")).toBe("2026-12-31");
    });

    it("returns null for malformed input", () => {
      expect(internals.parseUsDate("2025-07-28")).toBeNull(); // wrong format
      expect(internals.parseUsDate("13/01/2025")).toBeNull(); // month out of range
      expect(internals.parseUsDate("07/32/2025")).toBeNull(); // day out of range
      expect(internals.parseUsDate("foo")).toBeNull();
      expect(internals.parseUsDate("")).toBeNull();
    });
  });

  describe("isLikelyStockTicker", () => {
    it("accepts common stock tickers", () => {
      expect(internals.isLikelyStockTicker("AAPL")).toBe(true);
      expect(internals.isLikelyStockTicker("MSFT")).toBe(true);
      expect(internals.isLikelyStockTicker("T")).toBe(true);
      expect(internals.isLikelyStockTicker("GOOGL")).toBe(true);
      expect(internals.isLikelyStockTicker("BRK.B")).toBe(true);
      expect(internals.isLikelyStockTicker("GSK")).toBe(true);
      expect(internals.isLikelyStockTicker("INTU")).toBe(true);
    });

    it("rejects Treasury CUSIPs and other 9-char identifiers", () => {
      expect(internals.isLikelyStockTicker("91282CJP7")).toBe(false);
      expect(internals.isLikelyStockTicker("912797KJ5")).toBe(false);
    });

    it("rejects tickers starting with a digit", () => {
      expect(internals.isLikelyStockTicker("2222")).toBe(false);
    });
  });

  describe("normalizeTxType", () => {
    it("expands single-letter codes to standardized strings", () => {
      expect(internals.normalizeTxType("P", false)).toBe("Purchase");
      expect(internals.normalizeTxType("S", false)).toBe("Sale (Full)");
      expect(internals.normalizeTxType("S", true)).toBe("Sale (Partial)");
      expect(internals.normalizeTxType("E", false)).toBe("Exchange");
    });
  });

  describe("normalizeOwner", () => {
    it("decodes owner relationship codes", () => {
      expect(internals.normalizeOwner(null)).toBe("Self");
      expect(internals.normalizeOwner("--")).toBe("Self");
      expect(internals.normalizeOwner("SP")).toBe("Spouse");
      expect(internals.normalizeOwner("JT")).toBe("Joint");
      expect(internals.normalizeOwner("DC")).toBe("Dependent Child");
    });
  });

  describe("TXN_REGEX", () => {
    it("matches the canonical single-transaction line", () => {
      const s = "GSK plc American Depositary Shares (GSK) [ST] S 07/28/2025 08/11/2025 $1,001 - $15,000";
      internals.TXN_REGEX.lastIndex = 0;
      const m = internals.TXN_REGEX.exec(s);
      expect(m).not.toBeNull();
      expect(m![3]).toBe("GSK");
      expect(m![4]).toBe("S");
      expect(m![5]).toBe("07/28/2025");
      expect(m![7]).toBe("1,001");
      expect(m![8]).toBe("15,000");
    });

    it("captures the owner code when present", () => {
      const s = "SP Intuit Inc. - Common Stock (INTU) [ST] P 06/20/2025 07/03/2025 $1,001 - $15,000";
      internals.TXN_REGEX.lastIndex = 0;
      const m = internals.TXN_REGEX.exec(s);
      expect(m).not.toBeNull();
      expect(m![1]).toBe("SP");
      expect(m![3]).toBe("INTU");
      expect(m![4]).toBe("P");
    });

    it("matches multiple transactions in one string (global flag)", () => {
      const s =
        "Netflix, Inc. - Common Stock (NFLX) [ST] P 05/16/2025 06/09/2025 $15,001 - $50,000 " +
        "Thermo Fisher Scientific Inc Common Stock (TMO) [ST] S 05/16/2025 06/09/2025 $15,001 - $50,000";
      internals.TXN_REGEX.lastIndex = 0;
      const m1 = internals.TXN_REGEX.exec(s);
      const m2 = internals.TXN_REGEX.exec(s);
      expect(m1?.[3]).toBe("NFLX");
      expect(m1?.[4]).toBe("P");
      expect(m2?.[3]).toBe("TMO");
      expect(m2?.[4]).toBe("S");
    });

    it("matches the 'S (partial)' qualifier without failing on it", () => {
      const s = "Some Asset (XYZ) [ST] S (partial) 01/01/2025 02/01/2025 $1,001 - $15,000";
      internals.TXN_REGEX.lastIndex = 0;
      const m = internals.TXN_REGEX.exec(s);
      expect(m).not.toBeNull();
      expect(m![3]).toBe("XYZ");
      expect(m![4]).toBe("S");
    });

    it("does not match form preamble noise", () => {
      const s = "P T R Clerk of the House of Representatives Legislative Resource Center Washington DC 20515";
      internals.TXN_REGEX.lastIndex = 0;
      expect(internals.TXN_REGEX.exec(s)).toBeNull();
    });
  });

  describe("XML index parser", () => {
    it("parses single-member XML", () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<FinancialDisclosure>
  <Member>
    <Prefix>Hon.</Prefix>
    <Last>Doe</Last>
    <First>Jane</First>
    <Suffix></Suffix>
    <FilingType>P</FilingType>
    <StateDst>CA12</StateDst>
    <Year>2025</Year>
    <FilingDate>3/15/2025</FilingDate>
    <DocID>20012345</DocID>
  </Member>
</FinancialDisclosure>`;
      const members = internals.parseXmlIndex(xml);
      expect(members).toHaveLength(1);
      expect(members[0].Last).toBe("Doe");
      expect(members[0].FilingType).toBe("P");
      expect(members[0].DocID).toBe("20012345");
    });

    it("parses multi-member XML as an array", () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<FinancialDisclosure>
  <Member><Last>A</Last><First>X</First><FilingType>P</FilingType><StateDst>X01</StateDst><Year>2025</Year><FilingDate>1/1/2025</FilingDate><DocID>1</DocID></Member>
  <Member><Last>B</Last><First>Y</First><FilingType>C</FilingType><StateDst>X02</StateDst><Year>2025</Year><FilingDate>2/1/2025</FilingDate><DocID>2</DocID></Member>
</FinancialDisclosure>`;
      const members = internals.parseXmlIndex(xml);
      expect(members).toHaveLength(2);
      expect(members.map((m) => m.Last)).toEqual(["A", "B"]);
    });
  });
});
