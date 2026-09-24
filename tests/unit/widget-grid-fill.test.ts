import { describe, it, expect } from "vitest";
import { baseSpan, fillClasses, fillSpans } from "@/lib/widget-grid-fill";
import { DEFAULT_LAYOUT, getWidgetDefinition, type WidgetSize } from "@/lib/widget-registry";

const DEFAULT_SIZES = DEFAULT_LAYOUT.map((id) => getWidgetDefinition(id)!.defaultSize);

/** Cells used per row once the extra spans are applied, for a dense grid. */
function cellsFilled(sizes: WidgetSize[], cols: number): number {
  const extra = fillSpans(sizes, cols);
  return sizes.reduce((n, s, i) => n + baseSpan(s, cols) + extra[i], 0);
}

describe("fillSpans", () => {
  it("leaves nothing to do when the spans already make whole rows", () => {
    expect(fillSpans(["sm", "sm", "sm"], 3)).toEqual([0, 0, 0]);
    expect(fillSpans(["md", "sm"], 3)).toEqual([0, 0]);
  });

  it("widens the last tile into a trailing blank cell", () => {
    // sm md | md _  ->  the second md takes the blank.
    expect(fillSpans(["sm", "md", "md"], 3)).toEqual([0, 0, 1]);
  });

  it("backfills densely before widening, as the CSS does", () => {
    // md _ | md _ | sm: dense moves the sm up beside the first md.
    expect(fillSpans(["md", "md", "sm"], 3)).toEqual([0, 1, 0]);
  });

  it("gives the default dashboard whole rows at 2, 3 and 4 columns", () => {
    for (const cols of [2, 3, 4]) {
      expect(cellsFilled(DEFAULT_SIZES, cols) % cols).toBe(0);
    }
  });

  it("does nothing on a single column", () => {
    expect(fillSpans(["md", "sm"], 1)).toEqual([0, 0]);
  });
});

describe("fillClasses", () => {
  it("is empty for a tile that keeps its own span everywhere", () => {
    // Twelve cells make whole rows at 2, 3 and 4 columns.
    const twelve: WidgetSize[] = new Array(12).fill("sm");
    expect(fillClasses(twelve)).toEqual(new Array(12).fill(""));
  });

  it("states the span at every breakpoint once a tile is widened", () => {
    // Three sm tiles: 2 cols leaves one blank (row 2), 3 cols none, 4 cols one.
    const classes = fillClasses(["sm", "sm", "sm"]);
    expect(classes[2]).toBe("md:col-span-2 xl:col-span-1 2xl:col-span-2");
    expect(classes[0]).toBe("");
  });
});
