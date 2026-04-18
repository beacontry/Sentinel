"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown } from "lucide-react";
import type { GlossaryCategory } from "@/lib/glossary-data";

const CATEGORY_VARIANTS: Record<GlossaryCategory, { variant: "default" | "bullish" | "bearish" | "warning" | "neutral"; label: string }> = {
  basics: { variant: "default", label: "Basics" },
  technical: { variant: "bullish", label: "Technical" },
  fundamental: { variant: "warning", label: "Fundamental" },
  options: { variant: "bearish", label: "Options" },
  risk: { variant: "neutral", label: "Risk" },
};

interface GlossaryTermProps {
  term: string;
  definition: string;
  category: GlossaryCategory;
  examples: string[];
}

export function GlossaryTermCard({ term, definition, category, examples }: GlossaryTermProps) {
  const [expanded, setExpanded] = useState(false);
  const cat = CATEGORY_VARIANTS[category];

  return (
    <Card hover className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">{term}</h3>
          <Badge variant={cat.variant}>{cat.label}</Badge>
        </div>
        <button
          className="p-1 text-text-muted hover:text-text-secondary transition-colors shrink-0
            min-w-[32px] min-h-[32px] flex items-center justify-center"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 animate-fade-in">
          <p className="text-sm text-text-secondary leading-relaxed">{definition}</p>
          {examples.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Examples</p>
              <ul className="space-y-1">
                {examples.map((ex, i) => (
                  <li
                    key={i}
                    className="text-xs text-text-secondary pl-3 leading-relaxed"
                  >
                    {ex}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
