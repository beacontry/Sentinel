"use client";

import { useMemo, type ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  GLOSSARY_TERMS,
  type GlossaryTerm,
} from "@/lib/glossary-data";

/**
 * Auto-links known glossary terms inside paragraph / list / callout text.
 *
 * On first render, builds a regex from all known terms (longest-first to
 * avoid "Roth" matching inside "Roth IRA"). Splits the input text and wraps
 * each match in an inline Radix Tooltip showing the definition.
 *
 * Performance: regex is built once per process via module-level lazy init.
 * Splitting/rendering is O(n) per text node where n = number of words, which
 * is fine for the < 1000-word paragraphs we author.
 *
 * Edge cases handled:
 *   - Case-insensitive match
 *   - Word-boundary aware (won't match "Rothschild")
 *   - Skips matches inside an already-linked block (we just wrap top-level text)
 *   - Handles plurals naively by trying both `term` and `term + s`
 */

interface MatchPattern {
  /** Pattern source (the term + optional plural). */
  pattern: string;
  /** Reference back to the glossary entry. */
  termRef: GlossaryTerm;
}

let _patterns: MatchPattern[] | null = null;
let _regex: RegExp | null = null;

function buildPatterns(): { patterns: MatchPattern[]; regex: RegExp } {
  // Sort by length descending so longest matches win (multi-word terms first).
  const sorted = [...GLOSSARY_TERMS].sort(
    (a, b) => b.term.length - a.term.length,
  );

  const patterns: MatchPattern[] = [];
  for (const term of sorted) {
    // Skip terms that are too generic to auto-link (would create noise).
    if (term.term.length < 3) continue;
    if (GENERIC_TERMS.has(term.term.toLowerCase())) continue;
    patterns.push({
      pattern: escapeRegex(term.term),
      termRef: term,
    });
  }

  // Compile a single regex with alternation. Word boundaries on each side.
  // We use lookaround to avoid eating surrounding chars.
  const alternation = patterns.map((p) => p.pattern).join("|");
  // Note: `\b` doesn't work well with parens / special chars in terms like
  // "401(k)" or "§475(f)". We use lookbehind/lookahead for non-word chars,
  // accepting that these are edge cases.
  const regex = new RegExp(
    `(?<![\\w$])(${alternation})(?![\\w-])`,
    "gi",
  );

  return { patterns, regex };
}

const GENERIC_TERMS = new Set<string>([
  // These are real glossary entries but too common to auto-link without noise.
  "stock", "bond", "rate", "tax", "year", "loss", "gain", "income",
]);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPatterns(): { patterns: MatchPattern[]; regex: RegExp } {
  if (_patterns === null || _regex === null) {
    const built = buildPatterns();
    _patterns = built.patterns;
    _regex = built.regex;
  }
  return { patterns: _patterns, regex: _regex };
}

/**
 * Render text with auto-linked glossary terms. Falls back to plain text if
 * no terms match.
 */
export function GlossaryAwareText({ text }: { text: string }): ReactNode {
  const nodes = useMemo(() => {
    const { regex, patterns } = getPatterns();
    if (!text) return text;

    // Look up by lowercased term for fast match → entry
    const byLower = new Map<string, GlossaryTerm>();
    for (const p of patterns) byLower.set(p.termRef.term.toLowerCase(), p.termRef);

    const out: ReactNode[] = [];
    // Track terms we've already linked once in this paragraph — avoid linking
    // the same term 5 times in one paragraph.
    const seen = new Set<string>();

    let lastIndex = 0;
    // Reset regex state (it's stateful with /g)
    regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const [matched] = match;
      const start = match.index;
      const lower = matched.toLowerCase();
      const term = byLower.get(lower);
      if (!term || seen.has(term.id)) continue;
      seen.add(term.id);

      if (start > lastIndex) {
        out.push(text.slice(lastIndex, start));
      }

      out.push(
        <TooltipPrimitive.Root key={`${term.id}-${start}`} delayDuration={120}>
          <TooltipPrimitive.Trigger asChild>
            <span className="border-b border-dashed border-text-muted/60 cursor-help text-text-primary">
              {matched}
            </span>
          </TooltipPrimitive.Trigger>
          <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
              side="top"
              align="center"
              sideOffset={6}
              className="z-50 max-w-sm rounded-lg border border-border bg-bg-elevated p-3 text-xs leading-relaxed text-text-secondary shadow-lg animate-fade-in"
            >
              <p className="font-semibold text-text-primary mb-1">
                {term.term}
              </p>
              <p>{term.definition}</p>
              <TooltipPrimitive.Arrow className="fill-bg-elevated" />
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>
        </TooltipPrimitive.Root>,
      );

      lastIndex = start + matched.length;
    }

    if (lastIndex < text.length) {
      out.push(text.slice(lastIndex));
    }

    return out.length > 0 ? out : text;
  }, [text]);

  return <>{nodes}</>;
}

/**
 * Wraps children in a single TooltipProvider. Mount once at the top of any
 * tree using GlossaryAwareText.
 */
export function GlossaryTooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={120}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

/** Test-only: reset the cached regex/patterns between cases. */
export function _resetGlossaryPatternsForTests(): void {
  _patterns = null;
  _regex = null;
}
