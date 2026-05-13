"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar,
  User,
  Lock,
  FileText,
} from "lucide-react";
import { SmartBackButton } from "@/components/ui/smart-back-button";

interface ArticleDetail {
  id: string;
  title: string;
  slug: string;
  body: string;
  category: string | null;
  price: number;
  publishedAt: string | null;
  authorId: string;
  authorName: string | null;
  locked: boolean;
  hasPurchased: boolean;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function ArticleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArticle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/articles/${encodeURIComponent(slug)}`);
      if (res.status === 404) {
        setError("Article not found");
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setArticle(data.article);
    } catch {
      setError("Failed to load article");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" rounded="md" />
        <Skeleton className="h-6 w-32" rounded="md" />
        <Skeleton className="h-64" rounded="lg" />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="p-4 lg:p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <SmartBackButton fallbackHref="/dashboard/articles" label="Back to Articles" iconSize={16} />
        </div>
        <Card className="py-12 text-center">
          <FileText className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary">{error ?? "Article not found"}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
      {/* Back link — uses browser history when same-origin (so the user returns to wherever they came from, not always articles list) */}
      <SmartBackButton fallbackHref="/dashboard/articles" label="Back to Articles" iconSize={16} />

      {/* Article Header */}
      <div className="">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {article.category && (
            <Badge variant="neutral">{article.category}</Badge>
          )}
          {article.price > 0 && (
            <Badge variant="warning">
              ${article.price.toFixed(2)}
            </Badge>
          )}
        </div>

        <h1 className="font-display text-2xl lg:text-3xl font-bold text-text-primary leading-tight">
          {article.title}
        </h1>

        <div className="flex items-center gap-4 mt-4 flex-wrap">
          <span className="flex items-center gap-1.5 text-sm text-text-secondary">
            <User className="w-4 h-4" />
            {article.authorName ?? "Unknown Author"}
          </span>
          {article.publishedAt && (
            <span className="flex items-center gap-1.5 text-sm text-text-secondary">
              <Calendar className="w-4 h-4" />
              {formatDate(article.publishedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Article Body */}
      <Card className="px-6 py-8">
        <div className="prose-sm text-text-secondary leading-relaxed whitespace-pre-line">
          {article.body.split("\n\n").map((paragraph, i) => (
            <p key={i} className="mb-4 last:mb-0">
              {paragraph}
            </p>
          ))}
        </div>

        {/* Locked overlay */}
        {article.locked && (
          <div className="mt-6 pt-6 border-t border-border">
            <div className="flex flex-col items-center text-center py-8">
              <div className="p-3 rounded-full bg-warning/10 mb-4">
                <Lock className="w-6 h-6 text-warning" />
              </div>
              <h3 className="text-base font-semibold text-text-primary mb-2">
                Premium Content
              </h3>
              <p className="text-sm text-text-secondary max-w-sm mb-6">
                This article requires a purchase to read the full content.
                Unlock it for ${article.price.toFixed(2)}.
              </p>
              <Button>
                <Lock className="w-4 h-4" />
                Unlock Article - ${article.price.toFixed(2)}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
