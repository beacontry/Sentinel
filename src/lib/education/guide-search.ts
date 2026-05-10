/**
 * Lightweight inverted-index search over education guides for AI chat RAG.
 *
 * Builds an in-memory token → guide-section index from the static GUIDES array
 * once per process, then answers free-text queries with a small TF-style score
 * against guide titles + section headings + paragraph/list/callout text.
 *
 * Why not a vector DB / embedding search? GUIDES is ~11 documents, ~150
 * sections total. A full inverted index over all of it fits in single-digit
 * MBs and runs in microseconds. Adding embedding infra would be massive
 * overkill for this scale.
 *
 * Used by gatherChatContext() to inject relevant guide snippets into the
 * system prompt so the chatbot can cite our content.
 */

import { GUIDES, type Guide, type GuideBlock } from "./guides-data";

export interface GuideSearchHit {
  /** Guide slug (URL path component). */
  slug: string;
  /** Human-readable guide title. */
  title: string;
  /** Section ID (URL fragment). */
  sectionId: string;
  /** Section heading. */
  sectionHeading: string;
  /** Compact text snippet (≤ 320 chars) from the section. */
  snippet: string;
  /** Relative score (higher = more relevant). */
  score: number;
}

interface IndexEntry {
  guide: Guide;
  sectionId: string;
  sectionHeading: string;
  text: string;
  /** Pre-computed term frequencies for this entry. */
  tf: Map<string, number>;
}

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
  "i", "in", "is", "it", "its", "of", "on", "or", "that", "the", "this", "to",
  "was", "were", "what", "when", "where", "which", "who", "why", "with",
  "you", "your", "we", "our", "they", "them", "but", "not", "no", "do", "does",
  "did", "if", "so", "than", "then", "there", "these", "those", "can", "could",
  "should", "would", "will", "shall", "may", "might", "about", "into", "out",
  "up", "down", "over", "under", "again", "any", "all", "some", "more", "most",
  "such", "only", "own", "same", "very", "just", "also", "much", "many", "how",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s%§-]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Extract searchable text from a single block. */
function blockText(block: GuideBlock): string {
  switch (block.type) {
    case "paragraph":
      return block.text;
    case "heading":
      return block.text;
    case "list":
      return block.items.join(" ");
    case "table":
      return [block.caption ?? "", block.headers.join(" "), ...block.rows.map((r) => r.join(" "))].join(" ");
    case "callout":
      return [block.title ?? "", block.body].join(" ");
    case "key-value":
      return [block.caption ?? "", ...block.pairs.map((p) => `${p.label} ${p.value}`)].join(" ");
    case "calculator":
      return block.caption ?? "";
    default:
      return "";
  }
}

/** Build a flat per-section snippet (concatenated paragraph/callout text). */
function snippetFromBlocks(blocks: GuideBlock[], maxLen = 320): string {
  const candidates: string[] = [];
  for (const b of blocks) {
    if (b.type === "paragraph") candidates.push(b.text);
    else if (b.type === "callout") candidates.push(b.body);
    if (candidates.length >= 3) break;
  }
  const joined = candidates.join(" ");
  if (joined.length <= maxLen) return joined;
  // Trim at sentence boundary if possible
  const sliced = joined.slice(0, maxLen);
  const lastDot = sliced.lastIndexOf(". ");
  return lastDot > maxLen / 2
    ? `${sliced.slice(0, lastDot + 1)}…`
    : `${sliced}…`;
}

// ─── Index construction (lazy, once per process) ─────────────────────────

interface BuiltIndex {
  entries: IndexEntry[];
  /** Document frequency for each term across all entries. */
  df: Map<string, number>;
}

let _index: BuiltIndex | null = null;

function buildIndex(): BuiltIndex {
  const entries: IndexEntry[] = [];
  for (const guide of GUIDES) {
    for (const section of guide.sections) {
      const sectionTextParts: string[] = [
        guide.title,
        section.heading,
        ...section.blocks.map(blockText),
      ];
      const text = sectionTextParts.join(" ");
      const tokens = tokenize(text);
      const tf = new Map<string, number>();
      for (const tok of tokens) tf.set(tok, (tf.get(tok) ?? 0) + 1);
      entries.push({
        guide,
        sectionId: section.id,
        sectionHeading: section.heading,
        text,
        tf,
      });
    }
  }

  // Document frequency: how many entries contain each term
  const df = new Map<string, number>();
  for (const e of entries) {
    for (const tok of e.tf.keys()) {
      df.set(tok, (df.get(tok) ?? 0) + 1);
    }
  }

  return { entries, df };
}

function getIndex(): BuiltIndex {
  if (_index === null) _index = buildIndex();
  return _index;
}

// ─── Query ───────────────────────────────────────────────────────────────

const QUERY_BOOSTS: Record<string, number> = {
  // Recognized canonical terms get an extra weight
  roth: 1.5,
  ira: 1.5,
  hsa: 1.5,
  "529": 1.8,
  mtm: 2.0,
  "475(f)": 2.0,
  "475f": 2.0,
  wash: 1.8,
  estate: 1.5,
  backdoor: 1.8,
  fire: 1.5,
  401: 1.2,
  "401k": 1.5,
  insurance: 1.3,
  whole: 1.2,
  term: 1.2,
};

/**
 * Search guides for the top-K most relevant section snippets.
 * Returns hits sorted by descending score.
 */
export function searchGuides(query: string, topK = 3): GuideSearchHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const idx = getIndex();
  const N = idx.entries.length;

  // Score entries: simple TF-IDF with query-boost
  const scores: { entry: IndexEntry; score: number }[] = [];
  for (const entry of idx.entries) {
    let score = 0;
    for (const qTok of tokens) {
      const tf = entry.tf.get(qTok);
      if (!tf) continue;
      const df = idx.df.get(qTok) ?? 1;
      const idf = Math.log(1 + N / df);
      const boost = QUERY_BOOSTS[qTok] ?? 1;
      score += tf * idf * boost;
    }
    if (score > 0) scores.push({ entry, score });
  }

  scores.sort((a, b) => b.score - a.score);

  // De-duplicate by guide so we don't return 3 sections from the same guide
  const seen = new Set<string>();
  const hits: GuideSearchHit[] = [];
  for (const s of scores) {
    if (seen.has(s.entry.guide.slug)) continue;
    seen.add(s.entry.guide.slug);
    const guide = s.entry.guide;
    const section = guide.sections.find((sec) => sec.id === s.entry.sectionId);
    if (!section) continue;
    hits.push({
      slug: guide.slug,
      title: guide.title,
      sectionId: s.entry.sectionId,
      sectionHeading: s.entry.sectionHeading,
      snippet: snippetFromBlocks(section.blocks),
      score: s.score,
    });
    if (hits.length >= topK) break;
  }

  return hits;
}

/** Reset the cached index (test-only). */
export function _resetIndexForTests(): void {
  _index = null;
}
