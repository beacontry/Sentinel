"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { FileText, Lock, Calendar, User } from "lucide-react";

interface ArticleListItem {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  price: number;
  publishedAt: string | null;
  authorId: string;
  authorName: string | null;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatPrice(price: number): string {
  if (!price || price === 0) return "Free";
  return `$${price.toFixed(2)}`;
}

export default function ArticlesPage() {
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const fetchArticles = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/articles?page=${p}&limit=12`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setArticles(data.articles ?? []);
      setTotalPages(data.totalPages ?? 0);
    } catch {
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArticles(page);
  }, [fetchArticles, page]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.research} />
      <PageIntro
        eyebrow="Research"
        title="Articles"
        description="In-depth analysis and premium trading insights from the community."
        stats={[
          { label: "Total Articles", value: String(articles.length) },
          { label: "Page", value: `${page} / ${totalPages || 1}` },
          { label: "Free", value: String(articles.filter((a) => !a.price || a.price === 0).length), tone: "bullish" },
          { label: "Premium", value: String(articles.filter((a) => a.price && a.price > 0).length), tone: "brand" },
        ]}
      />

      {/* Article Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44" rounded="lg" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-12 h-12" />}
          title="No Articles Yet"
          description="Published articles will appear here."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {articles.map((article) => {
              const isFree = !article.price || article.price === 0;

              return (
                <Link
                  key={article.id}
                  href={`/dashboard/articles/${article.slug}`}
                  className="block group"
                >
                  <Card hover className="h-full flex flex-col">
                    {/* Category + Price */}
                    <div className="flex items-center justify-between mb-3">
                      {article.category ? (
                        <Badge variant="neutral">{article.category}</Badge>
                      ) : (
                        <span />
                      )}
                      <Badge variant={isFree ? "bullish" : "warning"}>
                        {isFree ? (
                          "Free"
                        ) : (
                          <span className="flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            {formatPrice(article.price)}
                          </span>
                        )}
                      </Badge>
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors line-clamp-2 flex-1">
                      {article.title}
                    </h3>

                    {/* Author + Date */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                      <span className="flex items-center gap-1.5 text-xs text-text-muted">
                        <User className="w-3 h-3" />
                        {article.authorName ?? "Unknown"}
                      </span>
                      {article.publishedAt && (
                        <span className="flex items-center gap-1.5 text-xs text-text-muted">
                          <Calendar className="w-3 h-3" />
                          {formatDate(article.publishedAt)}
                        </span>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center pt-4">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
