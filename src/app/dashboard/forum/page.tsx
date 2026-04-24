"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Plus,
  ArrowLeft,
  MessagesSquare,
  Eye,
  Clock,
  Users,
  Flame,
  BookOpen,
  Target,
  BarChart3,
  Search,
  Lightbulb,
  TrendingUp,
  Coins,
  GraduationCap,
  FileSearch,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Modal, ModalHeader, ModalTitle, ModalFooter } from "@/components/ui/modal";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { ThreadPreview } from "@/components/social/thread-preview";

// ─── Types ────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  description: string | null;
  threadCount: number;
  replyCount: number;
  lastThreadTitle: string | null;
  lastThreadAuthor: string | null;
  lastActivityAt: string | null;
}

interface Thread {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  locked: boolean;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  userId: string;
  categoryId: string;
  authorName: string;
  categoryName: string;
  replyCount: number;
  lastReplyAt: string | null;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ─── Category Icons ───────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, typeof MessageSquare> = {
  "General Discussion": MessagesSquare,
  "Trade Ideas & Setups": Target,
  "Technical Analysis": BarChart3,
  "Due Diligence": FileSearch,
  "Options & Derivatives": TrendingUp,
  "Earnings Plays": Flame,
  "Small Caps & Penny Stocks": Coins,
  "Post-Mortems": BookOpen,
  "Beginner Corner": GraduationCap,
};

// ─── Helpers ──────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ─── Page ─────────────────────────────────────────────────────────

export default function ForumPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [showNewThread, setShowNewThread] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // New thread form
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");

  // Load categories
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/forum/categories");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setCategories(data.categories);
      } catch {
        // Non-critical
      } finally {
        if (!cancelled) setLoadingCategories(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load threads for a category
  const loadThreads = useCallback(
    async (page: number, categoryId: string) => {
      setLoadingThreads(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: "20",
          categoryId,
        });
        const res = await fetch(`/api/forum?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        setThreads(data.threads);
        setPagination(data.pagination);
      } catch {
        // Non-critical
      } finally {
        setLoadingThreads(false);
      }
    },
    []
  );

  function handleEnterCategory(cat: Category) {
    setActiveCategory(cat);
    setNewCategoryId(cat.id);
    loadThreads(1, cat.id);
  }

  function handleBackToBoard() {
    setActiveCategory(null);
    setThreads([]);
  }

  function handlePageChange(page: number) {
    if (activeCategory) {
      loadThreads(page, activeCategory.id);
    }
  }

  function handleNewThreadInCategory() {
    if (activeCategory) {
      setNewCategoryId(activeCategory.id);
    }
    setShowNewThread(true);
  }

  async function handleCreateThread(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newBody.trim() || !newCategoryId || creating) return;

    setCreating(true);
    setCreateError("");

    try {
      const res = await fetch("/api/forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          body: newBody.trim(),
          categoryId: newCategoryId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setCreateError(data.error || "Failed to create thread");
        return;
      }

      setNewTitle("");
      setNewBody("");
      setNewCategoryId("");
      setShowNewThread(false);

      // Reload — either the category thread list or refresh categories
      if (activeCategory) {
        loadThreads(1, activeCategory.id);
      }
      // Refresh category stats
      const catRes = await fetch("/api/forum/categories");
      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData.categories);
      }
    } catch {
      setCreateError("Network error");
    } finally {
      setCreating(false);
    }
  }

  const totalThreads = categories.reduce((s, c) => s + c.threadCount, 0);
  const totalReplies = categories.reduce((s, c) => s + c.replyCount, 0);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.community} />

      {activeCategory ? (
        /* ─── Category Thread Listing ──────────────────────────── */
        <CategoryView
          category={activeCategory}
          threads={threads}
          pagination={pagination}
          loading={loadingThreads}
          onBack={handleBackToBoard}
          onPageChange={handlePageChange}
          onNewThread={handleNewThreadInCategory}
        />
      ) : (
        /* ─── Board Index ──────────────────────────────────────── */
        <>
          <PageIntro
            eyebrow="Community"
            title="Forum"
            description="Pick a room and jump in. Share setups, post-mortems, and DD with other traders."
            actions={
              <Button size="md" onClick={() => setShowNewThread(true)}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New</span> Thread
              </Button>
            }
            stats={[
              {
                label: "Boards",
                value: categories.length || "--",
              },
              {
                label: "Threads",
                value: totalThreads,
                tone: "brand",
              },
              {
                label: "Replies",
                value: totalReplies,
              },
            ]}
          />

          {loadingCategories ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20" rounded="lg" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-12 w-12" />}
              title="No boards yet"
              description="Forum categories haven't been configured."
            />
          ) : (
            <div className="space-y-2">
              {categories.map((cat) => (
                <CategoryRow
                  key={cat.id}
                  category={cat}
                  onClick={() => handleEnterCategory(cat)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* New Thread Modal */}
      <Modal open={showNewThread} onClose={() => setShowNewThread(false)}>
        <ModalHeader>
          <ModalTitle>New Thread</ModalTitle>
        </ModalHeader>
        <form onSubmit={handleCreateThread} className="space-y-4">
          <Input
            label="Title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Thread title"
            maxLength={200}
          />
          {activeCategory ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted mb-1.5">
                Category
              </p>
              <Badge variant="default">{activeCategory.name}</Badge>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label
                htmlFor="new-thread-category"
                className="block text-xs font-medium text-text-secondary"
              >
                Category
              </label>
              <select
                id="new-thread-category"
                value={newCategoryId}
                onChange={(e) => setNewCategoryId(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-border bg-bg-elevated px-3 py-2.5
                  text-sm text-text-primary transition-colors duration-150
                  focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
              >
                <option value="" disabled>
                  Select a board
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Textarea
            label="Body"
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Share your analysis... Use $NVDA to mention tickers, [[screener]] to link pages"
            rows={5}
            maxLength={10000}
          />
          {createError && <p className="text-xs text-bearish">{createError}</p>}
          <ModalFooter>
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setShowNewThread(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="md"
              disabled={
                !newTitle.trim() || !newBody.trim() || !newCategoryId || creating
              }
              loading={creating}
            >
              Create Thread
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}

// ─── Category Row (Board Index) ───────────────────────────────────

function CategoryRow({
  category,
  onClick,
}: {
  category: Category;
  onClick: () => void;
}) {
  const Icon = CATEGORY_ICONS[category.name] ?? MessageSquare;

  return (
    <button
      onClick={onClick}
      className="w-full text-left cursor-pointer group"
    >
      <Card hover className="block">
        <div className="flex gap-4">
          {/* Icon */}
          <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 text-accent shrink-0 mt-0.5 group-hover:bg-accent/15 transition-colors">
            <Icon className="w-5 h-5" />
          </div>

          {/* Name + Description */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors truncate">
              {category.name}
            </h3>
            {category.description && (
              <p className="text-xs text-text-muted mt-0.5 line-clamp-1">
                {category.description}
              </p>
            )}
          </div>

          {/* Stats */}
          <div className="hidden sm:flex items-center gap-6 shrink-0 text-xs text-text-muted">
            <div className="text-center w-16">
              <p className="font-mono font-semibold text-text-secondary text-sm">
                {formatCount(category.threadCount)}
              </p>
              <p className="text-[10px] uppercase tracking-wider">threads</p>
            </div>
            <div className="text-center w-16">
              <p className="font-mono font-semibold text-text-secondary text-sm">
                {formatCount(category.replyCount)}
              </p>
              <p className="text-[10px] uppercase tracking-wider">replies</p>
            </div>
          </div>

          {/* Last Activity */}
          <div className="hidden lg:block shrink-0 w-44 text-right">
            {category.lastThreadTitle ? (
              <div>
                <p className="text-xs text-text-secondary truncate">
                  {category.lastThreadTitle}
                </p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  by {category.lastThreadAuthor}
                  {category.lastActivityAt && (
                    <> &middot; {relativeTime(category.lastActivityAt)}</>
                  )}
                </p>
              </div>
            ) : (
              <p className="text-xs text-text-muted">No threads yet</p>
            )}
          </div>
        </div>

        {/* Mobile stats row */}
        <div className="sm:hidden flex items-center gap-4 mt-2 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            {category.threadCount} threads
          </span>
          <span className="inline-flex items-center gap-1">
            <MessagesSquare className="w-3 h-3" />
            {category.replyCount} replies
          </span>
          {category.lastActivityAt && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {relativeTime(category.lastActivityAt)}
            </span>
          )}
        </div>
      </Card>
    </button>
  );
}

// ─── Category View (Thread Listing) ──────────────────────────────

function CategoryView({
  category,
  threads,
  pagination,
  loading,
  onBack,
  onPageChange,
  onNewThread,
}: {
  category: Category;
  threads: Thread[];
  pagination: PaginationMeta;
  loading: boolean;
  onBack: () => void;
  onPageChange: (page: number) => void;
  onNewThread: () => void;
}) {
  const Icon = CATEGORY_ICONS[category.name] ?? MessageSquare;

  return (
    <>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Boards
        </Button>
      </div>

      <PageIntro
        eyebrow={category.name}
        title={category.name}
        description={category.description || "Browse and discuss threads in this board."}
        actions={
          <Button size="md" onClick={onNewThread}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New</span> Thread
          </Button>
        }
        stats={[
          { label: "Threads", value: pagination.total, tone: "brand" },
          { label: "Replies", value: category.replyCount },
          {
            label: "Last Active",
            value: category.lastActivityAt
              ? relativeTime(category.lastActivityAt)
              : "Never",
          },
        ]}
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" rounded="lg" />
          ))}
        </div>
      ) : threads.length === 0 ? (
        <EmptyState
          icon={<Icon className="h-12 w-12" />}
          title="No threads yet"
          description={`Be the first to start a discussion in ${category.name}.`}
          action={{
            label: "New Thread",
            onClick: onNewThread,
          }}
        />
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => (
            <ThreadPreview
              key={thread.id}
              id={thread.id}
              title={thread.title}
              authorName={thread.authorName}
              categoryName={thread.categoryName}
              replyCount={thread.replyCount}
              viewCount={thread.viewCount}
              createdAt={thread.createdAt}
              lastReplyAt={thread.lastReplyAt}
              pinned={thread.pinned}
              locked={thread.locked}
            />
          ))}
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </>
  );
}
