/**
 * Selection bookkeeping for a list whose detail pane loads on click and is
 * refreshed by a poll (the Optimizer run list).
 *
 * The page tracks two ids: the run the user asked for last, which gates
 * the poll, and the run whose detail is on screen. They differ only while
 * a click is loading. If that load fails they must be brought back
 * together, or the poll, which refreshes only the run last asked for,
 * stops refreshing the run still on screen and its status freezes.
 */

/**
 * What to do when the detail load for `id` fails.
 *
 * Returns null when there is nothing to undo: the user has since asked for
 * another run, or `id` is the run already on screen (a failed poll
 * refresh, retried on the next tick). Otherwise returns the id to point
 * the selection back at (the run on screen, or null when nothing is
 * shown), and the caller should tell the user the load failed.
 */
export function selectionAfterFailedLoad(
  id: string,
  latestRequestedId: string | null,
  shownId: string | null,
): { revertTo: string | null } | null {
  if (latestRequestedId !== id) return null;
  if (shownId === id) return null;
  return { revertTo: shownId };
}
