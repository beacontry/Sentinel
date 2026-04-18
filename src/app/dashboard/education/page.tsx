"use client";

import { useState, useMemo } from "react";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { GraduationCap, BookOpen } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { GlossaryTermCard } from "@/components/education/glossary-term";
import { GLOSSARY_TERMS, type GlossaryCategory } from "@/lib/glossary-data";

const CATEGORIES: { id: string; label: string; category: GlossaryCategory | "all" }[] = [
  { id: "all", label: "All", category: "all" },
  { id: "basics", label: "Basics", category: "basics" },
  { id: "technical", label: "Technical", category: "technical" },
  { id: "fundamental", label: "Fundamental", category: "fundamental" },
  { id: "options", label: "Options", category: "options" },
  { id: "risk", label: "Risk", category: "risk" },
];

function getCategoryCounts() {
  const counts: Record<string, number> = { all: GLOSSARY_TERMS.length };
  for (const term of GLOSSARY_TERMS) {
    counts[term.category] = (counts[term.category] ?? 0) + 1;
  }
  return counts;
}

export default function EducationPage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const categoryCounts = useMemo(getCategoryCounts, []);

  const filteredTerms = useMemo(() => {
    let terms = GLOSSARY_TERMS;

    if (activeTab !== "all") {
      terms = terms.filter((t) => t.category === activeTab);
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      terms = terms.filter(
        (t) =>
          t.term.toLowerCase().includes(q) ||
          t.definition.toLowerCase().includes(q)
      );
    }

    return terms;
  }, [search, activeTab]);

  const tabs = CATEGORIES.map((c) => ({
    id: c.id,
    label: `${c.label} (${categoryCounts[c.id] ?? 0})`,
  }));

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.research} />
      <PageIntro
        eyebrow="Research"
        title="Education"
        description="A searchable glossary of trading concepts with clear, concise definitions."
        stats={[
          { label: "Total Terms", value: String(GLOSSARY_TERMS.length) },
          { label: "Categories", value: String(CATEGORIES.length - 1) },
          { label: "Showing", value: String(filteredTerms.length) },
          { label: "Active Filter", value: activeTab === "all" ? "All" : CATEGORIES.find((c) => c.id === activeTab)?.label ?? activeTab, tone: "brand" },
        ]}
      />

      {/* Search */}
      <SearchInput
        onSearch={setSearch}
        placeholder="Search terms, definitions..."
      />

      {/* Category Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Results */}
      {CATEGORIES.map((cat) => (
        <TabPanel key={cat.id} active={activeTab === cat.id}>
          {filteredTerms.length === 0 ? (
            <div className="py-12 text-center">
              <GraduationCap className="w-10 h-10 text-text-muted mx-auto mb-3" />
              <p className="text-sm text-text-secondary">
                No terms found{search ? ` matching "${search}"` : ""}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredTerms.map((term) => (
                <GlossaryTermCard
                  key={term.id}
                  term={term.term}
                  definition={term.definition}
                  category={term.category}
                  examples={term.examples}
                />
              ))}
            </div>
          )}
        </TabPanel>
      ))}
    </div>
  );
}
