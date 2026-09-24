/**
 * parseJson: the shared parser for stored and cached payloads (WP12, #17).
 *
 * Invalid JSON and JSON of the wrong shape both return the fallback and are
 * logged with the caller's context, instead of throwing, or returning a value
 * cast to a type it does not have.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const warnings = vi.hoisted(() => [] as Array<{ obj: Record<string, unknown>; msg: string }>);

vi.mock("@/lib/logger", () => {
  const logger = {
    info: () => {},
    debug: () => {},
    error: () => {},
    warn: (obj: Record<string, unknown>, msg: string) => {
      warnings.push({ obj, msg });
    },
  };
  return { logger, createRouteLogger: () => logger };
});

import { parseJson } from "@/lib/parse-json";

interface Point {
  x: number;
}
const isPoint = (v: unknown): v is Point =>
  typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).x === "number";

beforeEach(() => {
  warnings.length = 0;
});

describe("parseJson", () => {
  it("returns a valid payload and logs nothing", () => {
    expect(parseJson('{"x":1}', null, "test", isPoint)).toEqual({ x: 1 });
    expect(warnings).toHaveLength(0);
  });

  it("returns the fallback for corrupt JSON and logs the context", () => {
    expect(parseJson("{not json", null, "ctx-corrupt", isPoint)).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].obj).toMatchObject({ context: "ctx-corrupt", bytes: 9 });
  });

  it("returns the fallback for a truncated payload", () => {
    const whole = JSON.stringify({ x: 1, pad: "a".repeat(100) });
    expect(parseJson(whole.slice(0, 40), "fb", "ctx-truncated")).toBe("fb");
    expect(warnings[0].obj).toMatchObject({ context: "ctx-truncated" });
  });

  it("returns the fallback for JSON of the wrong shape and logs it", () => {
    expect(parseJson('{"data":[1,2]}', null, "ctx-shape", isPoint)).toBeNull();
    expect(parseJson("null", null, "ctx-shape", isPoint)).toBeNull();
    expect(parseJson("[]", null, "ctx-shape", isPoint)).toBeNull();
    expect(warnings).toHaveLength(3);
    expect(warnings[0].msg).toMatch(/unexpected shape/);
  });

  it("without a predicate, any valid JSON is returned", () => {
    expect(parseJson("[1,2]", [], "ctx")).toEqual([1, 2]);
    expect(warnings).toHaveLength(0);
  });

  it("never logs the payload itself", () => {
    parseJson('{"secret":"hunter22"', null, "ctx", isPoint);
    expect(JSON.stringify(warnings)).not.toContain("hunter22");
  });
});
