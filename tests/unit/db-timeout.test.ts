import { describe, it, expect } from "vitest";
import { isStatementTimeout } from "@/lib/db";

describe("isStatementTimeout", () => {
  it("returns true for statement timeout errors", () => {
    const err = new Error("canceling statement due to statement timeout");
    expect(isStatementTimeout(err)).toBe(true);
  });

  it("returns true for errors containing 'statement timeout'", () => {
    const err = new Error("query failed: statement timeout exceeded");
    expect(isStatementTimeout(err)).toBe(true);
  });

  it("returns false for non-timeout errors", () => {
    const err = new Error("connection refused");
    expect(isStatementTimeout(err)).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isStatementTimeout("statement timeout")).toBe(false);
    expect(isStatementTimeout(null)).toBe(false);
    expect(isStatementTimeout(undefined)).toBe(false);
    expect(isStatementTimeout(42)).toBe(false);
  });
});
