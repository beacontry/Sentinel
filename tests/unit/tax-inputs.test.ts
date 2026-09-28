import { describe, it, expect } from "vitest";
import {
  commitIncomeDraft,
  isIncomeParam,
  parseOrdinaryIncome,
  DEFAULT_ORDINARY_INCOME,
} from "@/lib/tax-inputs";

describe("commitIncomeDraft", () => {
  it("commits a valid amount in canonical form", () => {
    expect(commitIncomeDraft("85000", "50000")).toBe("85000");
    expect(commitIncomeDraft(" 85000.50 ", "50000")).toBe("85000.5");
    expect(commitIncomeDraft("0", "50000")).toBe("0");
    expect(commitIncomeDraft("007", "50000")).toBe("7");
  });

  it("keeps the committed value for an empty field instead of the default", () => {
    expect(commitIncomeDraft("", "85000")).toBe("85000");
    expect(commitIncomeDraft("   ", "85000")).toBe("85000");
  });

  it("keeps the committed value for an unusable entry", () => {
    expect(commitIncomeDraft("-5", "85000")).toBe("85000");
    expect(commitIncomeDraft("abc", "85000")).toBe("85000");
    expect(commitIncomeDraft("1e30", "85000")).toBe("85000");
  });

  it("rounds to cents", () => {
    expect(commitIncomeDraft("100.129", "0")).toBe("100.13");
  });
});

describe("isIncomeParam", () => {
  it("accepts non-negative dollar amounts", () => {
    expect(isIncomeParam("0")).toBe(true);
    expect(isIncomeParam("85000")).toBe(true);
    expect(isIncomeParam("85000.5")).toBe(true);
  });

  it("rejects everything else", () => {
    for (const raw of ["", "-1", "1e5", "85,000", "1.234", "abc", "12345678901"]) {
      expect(isIncomeParam(raw)).toBe(false);
    }
  });
});

describe("parseOrdinaryIncome", () => {
  it("defaults when absent, empty or unusable", () => {
    expect(parseOrdinaryIncome(null)).toBe(DEFAULT_ORDINARY_INCOME);
    expect(parseOrdinaryIncome("")).toBe(DEFAULT_ORDINARY_INCOME);
    expect(parseOrdinaryIncome("abc")).toBe(DEFAULT_ORDINARY_INCOME);
    expect(parseOrdinaryIncome("-10")).toBe(DEFAULT_ORDINARY_INCOME);
  });

  it("honours an explicit zero", () => {
    expect(parseOrdinaryIncome("0")).toBe(0);
  });

  it("reads a given amount", () => {
    expect(parseOrdinaryIncome("85000")).toBe(85000);
  });
});
