/**
 * Tile sizing for figures that must stay whole (src/lib/figure-fit.ts).
 */

import { describe, it, expect } from "vitest";
import { textCh, tileRowVars } from "@/lib/figure-fit";

describe("textCh", () => {
  it("is the length of a figure with no spaces", () => {
    expect(textCh("$1,234,567.89")).toBe(13);
  });

  it("is the longest token when the text can break at a space", () => {
    expect(textCh("90 days")).toBe(4);
    expect(textCh("EDGAR + AI")).toBe(5);
  });

  it("counts characters, not UTF-16 units", () => {
    expect(textCh("−$3.00")).toBe(6);
  });

  it("is 0 for an empty string", () => {
    expect(textCh("")).toBe(0);
  });
});

describe("tileRowVars", () => {
  it("sets the figure width and the tile minimum at the 12px floor", () => {
    expect(tileRowVars(10)).toEqual({ "--figure-ch": 10, "--tile-min": "calc(10 * 0.45rem + 1.75rem)" });
  });

  it("sizes the tile minimum from a wider sub-line", () => {
    expect(tileRowVars(6, 12)).toEqual({ "--figure-ch": 6, "--tile-min": "calc(12 * 0.45rem + 1.75rem)" });
  });

  it("never divides the fit by zero when nothing is measured", () => {
    expect(tileRowVars(0)).toEqual({ "--figure-ch": 1, "--tile-min": "calc(1 * 0.45rem + 1.75rem)" });
  });
});
