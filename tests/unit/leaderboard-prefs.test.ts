import { describe, it, expect } from "vitest";
import { leaderboardPrefsPayload, isLeaderboardPrefs } from "@/lib/leaderboard-prefs";

describe("leaderboardPrefsPayload", () => {
  it("omits displayName when it was not edited, so the route leaves the handle alone", () => {
    expect(leaderboardPrefsPayload(true, "TapeReader", "TapeReader")).toEqual({ optIn: true });
    expect(leaderboardPrefsPayload(false, "", "")).toEqual({ optIn: false });
  });

  it("ignores whitespace-only differences", () => {
    expect(leaderboardPrefsPayload(true, "  TapeReader ", "TapeReader")).toEqual({ optIn: true });
  });

  it("sends the trimmed name when it was edited", () => {
    expect(leaderboardPrefsPayload(true, " NewHandle ", "TapeReader")).toEqual({
      optIn: true,
      displayName: "NewHandle",
    });
  });

  it("sends null only when the user cleared a loaded name", () => {
    expect(leaderboardPrefsPayload(true, "   ", "TapeReader")).toEqual({
      optIn: true,
      displayName: null,
    });
  });
});

describe("isLeaderboardPrefs", () => {
  it("accepts the route's GET shape", () => {
    expect(isLeaderboardPrefs({ optIn: true, displayName: "x" })).toBe(true);
    expect(isLeaderboardPrefs({ optIn: false, displayName: null })).toBe(true);
  });

  it("rejects anything a failed or odd response could produce", () => {
    expect(isLeaderboardPrefs(null)).toBe(false);
    expect(isLeaderboardPrefs({ error: "Unauthorized" })).toBe(false);
    expect(isLeaderboardPrefs({ optIn: "true" })).toBe(false);
    expect(isLeaderboardPrefs({ optIn: true, displayName: 5 })).toBe(false);
  });
});
