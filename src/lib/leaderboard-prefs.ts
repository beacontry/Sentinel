/**
 * Leaderboard preferences payload for PUT /api/leaderboard/preferences.
 *
 * The route treats an absent displayName as "leave it unchanged" and an
 * explicit null as "clear it", so the client sends displayName only when
 * the user actually changed it from what was loaded. A save can then
 * never clear a handle the form did not show.
 */
export interface LeaderboardPrefsPayload {
  optIn: boolean;
  displayName?: string | null;
}

export function leaderboardPrefsPayload(
  optIn: boolean,
  displayName: string,
  loadedDisplayName: string,
): LeaderboardPrefsPayload {
  const next = displayName.trim();
  if (next === loadedDisplayName.trim()) return { optIn };
  return { optIn, displayName: next || null };
}

/** Shape check for the GET response; anything else is a failed load. */
export function isLeaderboardPrefs(
  data: unknown,
): data is { optIn: boolean; displayName: string | null } {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.optIn === "boolean" &&
    (d.displayName === null || d.displayName === undefined || typeof d.displayName === "string")
  );
}
