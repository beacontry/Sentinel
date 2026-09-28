import type { CSSProperties } from "react";

/**
 * Sizing for readout tiles that keep every figure whole (the tile-grid and
 * figure-fit utilities in globals.css). A figure never breaks mid-number
 * and never runs past its tile: the row steps its figures down towards the
 * 12px floor until the widest one fits, and a figure too wide even at the
 * floor drops the grid a column.
 *
 * Used by the trader desk tiles and the PageIntro readout strip, so the
 * two cannot drift to different rules.
 */

/**
 * The custom properties a tile row sizes itself from: the widest main
 * figure (in ch) for figure-fit, and the widest token of any line, figure
 * or sub-line, at the 12px floor for the grid's minimum tile. 0.45rem is
 * one ch of the mono face at 12px; 1.75rem is the tile's padding and
 * border with a little slack.
 */
export function tileRowVars(figureCh: number, subCh = 0): CSSProperties {
  const widest = Math.max(figureCh, subCh, 1);
  return { "--figure-ch": Math.max(figureCh, 1), "--tile-min": `calc(${widest} * 0.45rem + 1.75rem)` } as CSSProperties;
}

/**
 * The width in ch of the widest unbreakable run of a plain string: its
 * longest whitespace-separated token. "$1,234,567.89" is one token of 13;
 * "90 days" can break at the space, so it needs 4.
 */
export function textCh(text: string): number {
  return text.split(/\s+/).reduce((widest, token) => Math.max(widest, [...token].length), 0);
}
