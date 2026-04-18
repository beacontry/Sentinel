import { NextResponse } from "next/server";
import { GLOSSARY_TERMS, type GlossaryCategory } from "@/lib/glossary-data";

const VALID_CATEGORIES: GlossaryCategory[] = ["basics", "technical", "fundamental", "options", "risk"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.toLowerCase().trim() ?? "";
  const category = searchParams.get("category")?.toLowerCase().trim() ?? "";

  let filtered = GLOSSARY_TERMS;

  if (category && VALID_CATEGORIES.includes(category as GlossaryCategory)) {
    filtered = filtered.filter((t) => t.category === category);
  }

  if (search) {
    filtered = filtered.filter(
      (t) =>
        t.term.toLowerCase().includes(search) ||
        t.definition.toLowerCase().includes(search)
    );
  }

  return NextResponse.json(
    { terms: filtered, total: filtered.length },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
