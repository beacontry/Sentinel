import type { WidgetSize } from "@/lib/widget-registry";

/**
 * Dashboard grid gap-filling. The widget grid packs its tiles with
 * `grid-auto-flow: dense`, but when the spans do not add up to whole rows
 * (the default layout is 11 cells in a 3-column grid) a cell is left
 * blank, usually beside the last tile. This works out, per column count,
 * how many extra columns each tile should take so that no row ends in a
 * blank cell: every blank cell is given to the tile on its left.
 *
 * Pure, so the placement can be tested without a browser; it mirrors the
 * CSS dense algorithm for single-row items (every widget is one row).
 */

/** Columns a widget of `size` spans in a grid of `cols` columns (widget-tile.tsx). */
export function baseSpan(size: WidgetSize, cols: number): number {
  if (cols <= 1) return 1;
  switch (size) {
    case "full":
      return cols;
    case "lg":
      return Math.min(3, cols);
    case "md":
      return 2;
    default:
      return 1;
  }
}

/**
 * Extra columns per tile, in order, for a grid of `cols` columns. A zero
 * means the tile keeps its own span.
 */
export function fillSpans(sizes: WidgetSize[], cols: number): number[] {
  const extra = sizes.map(() => 0);
  if (cols <= 1 || sizes.length === 0) return extra;

  // rows[r][c] = index of the tile in that cell, or -1 while empty.
  const rows: number[][] = [];
  const fits = (r: number, c: number, span: number) => {
    if (c + span > cols) return false;
    for (let k = c; k < c + span; k++) if ((rows[r]?.[k] ?? -1) !== -1) return false;
    return true;
  };

  sizes.forEach((size, i) => {
    const span = baseSpan(size, cols);
    // Dense: the first free run that fits, scanning from the top left.
    for (let r = 0; ; r++) {
      if (!rows[r]) rows[r] = new Array(cols).fill(-1);
      for (let c = 0; c + span <= cols; c++) {
        if (fits(r, c, span)) {
          for (let k = c; k < c + span; k++) rows[r][k] = i;
          return;
        }
      }
    }
  });

  for (const row of rows) {
    for (let c = 1; c < cols; c++) {
      if (row[c] === -1 && row[c - 1] !== -1) {
        row[c] = row[c - 1];
        extra[row[c]] += 1;
      }
    }
  }
  return extra;
}

/**
 * The span classes for a tile after filling. A tile that is widened at
 * any breakpoint gets an explicit span at all three (md is 2 columns, xl
 * 3, 2xl 4; widget-grid.tsx), because a widened span would otherwise
 * carry up into the next breakpoint. One literal class per value, so the
 * Tailwind scanner sees each. Empty when the tile keeps its own spans.
 */
const SPAN_CLASS: Record<number, Record<number, string>> = {
  2: { 1: "md:col-span-1", 2: "md:col-span-2" },
  3: { 1: "xl:col-span-1", 2: "xl:col-span-2", 3: "xl:col-span-3" },
  4: { 1: "2xl:col-span-1", 2: "2xl:col-span-2", 3: "2xl:col-span-3", 4: "2xl:col-span-4" },
};
const COLS = [2, 3, 4];

export function fillClasses(sizes: WidgetSize[]): string[] {
  const extras = COLS.map((cols) => fillSpans(sizes, cols));
  return sizes.map((size, i) => {
    if (extras.every((e) => e[i] === 0)) return "";
    return COLS.map((cols, k) => SPAN_CLASS[cols][baseSpan(size, cols) + extras[k][i]]).join(" ");
  });
}
