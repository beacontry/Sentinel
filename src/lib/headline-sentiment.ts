// Lightweight per-headline sentiment classifier. Deliberately keyword-
// based (not LLM-backed) so it's fast enough to run on every headline in
// the news feed without rate-limit pressure or token cost.
//
// Returns one of "bullish" | "bearish" | "neutral". The /api/news/feed
// route tags each article with its classification; the News page renders
// a small color-coded badge inline next to the headline so the user can
// scan a list at a glance.
//
// Not as accurate as Sentinel's full hybrid sentiment layer (which uses
// Claude/Groq + aggregates across articles). That's intentional: the
// hybrid layer powers signal-adjustment math where accuracy matters;
// this surfaces a directional hint where speed + zero cost matter.

export type HeadlineSentiment = "bullish" | "bearish" | "neutral";

// Bullish triggers — words/phrases that historically correlate with
// upside reactions. Curated, not learned. Spelling variants included.
const BULLISH_TERMS = [
  "beat", "beats", "beating",
  "exceeds", "exceeded", "outperform",
  "raise", "raised", "raises", "boost", "boosts", "boosted",
  "surge", "surged", "rally", "rallied", "rallies", "soar", "soared",
  "record", "all-time high",
  "upgrade", "upgraded", "upgrades",
  "strong", "robust", "solid",
  "growth", "grows", "expand", "expansion",
  "positive", "bullish",
  "buy", "buyback", "buybacks",
  "approval", "approved",
  "win", "wins", "won",
  "breakthrough",
  "partnership", "acquires", "acquiring",
  "profit", "profitable", "profits",
  "dividend hike", "dividend increase",
  "guidance raised", "outlook raised",
];

// Bearish triggers
const BEARISH_TERMS = [
  "miss", "misses", "missed",
  "drop", "drops", "dropped", "decline", "declines", "declined",
  "fall", "falls", "fell", "slump", "slumps", "slumped",
  "tumble", "tumbled", "plunge", "plunged",
  "downgrade", "downgraded", "downgrades",
  "warning", "warns", "warned",
  "cuts", "cut", "slashed", "slashes",
  "weak", "weakness",
  "loss", "losses", "losing",
  "negative", "bearish",
  "sell", "sell-off", "selloff",
  "investigation", "probe", "lawsuit", "lawsuits", "sued", "fraud",
  "recall", "recalls",
  "delay", "delayed", "delays",
  "bankruptcy", "bankrupt", "insolvent",
  "layoffs", "fired", "axed",
  "halt", "halted", "suspension", "suspends", "suspended",
  "guidance cut", "outlook cut", "guidance lowered",
  "below estimates", "below expectations",
];

// Pre-compile to lowercase set for O(1) lookups and word-boundary regex
const BULLISH_SET = new Set(BULLISH_TERMS);
const BEARISH_SET = new Set(BEARISH_TERMS);
const ALL_TERMS = [...BULLISH_TERMS, ...BEARISH_TERMS];
// Multi-word phrases need substring match; single words use boundary regex
const PHRASE_TERMS = ALL_TERMS.filter((t) => t.includes(" "));
// Build a single regex for fast scanning of single-word terms
const SINGLE_WORD_RE = new RegExp(
  "\\b(" +
    ALL_TERMS.filter((t) => !t.includes(" "))
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|") +
    ")\\b",
  "gi"
);

/**
 * Classify a single headline. Returns "neutral" when the headline has
 * roughly balanced or zero signal words.
 */
export function scoreHeadline(headline: string): HeadlineSentiment {
  if (!headline) return "neutral";
  const lower = headline.toLowerCase();
  let bullish = 0;
  let bearish = 0;

  // Single-word scan
  for (const match of lower.matchAll(SINGLE_WORD_RE)) {
    const term = match[1].toLowerCase();
    if (BULLISH_SET.has(term)) bullish++;
    else if (BEARISH_SET.has(term)) bearish++;
  }

  // Multi-word phrase scan (cheap — ~25 phrases × indexOf)
  for (const phrase of PHRASE_TERMS) {
    if (lower.includes(phrase)) {
      if (BULLISH_SET.has(phrase)) bullish++;
      else if (BEARISH_SET.has(phrase)) bearish++;
    }
  }

  // Tie or empty → neutral. Differences ≥ 1 pick the larger side.
  if (bullish === bearish) return "neutral";
  return bullish > bearish ? "bullish" : "bearish";
}
