"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { Modal, ModalHeader, ModalTitle, ModalFooter } from "@/components/ui/modal";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { ThreadPreview } from "@/components/social/thread-preview";

interface Category {
  id: string;
  name: string;
  description: string | null;
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

export default function ForumPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(true);
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
    async function loadCategories() {
      try {
        const res = await fetch("/api/forum/categories");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setCategories(data.categories);
      } catch {
        // Non-critical
      }
    }
    loadCategories();
    return () => { cancelled = true; };
  }, []);

  // Load threads
  const loadThreads = useCallback(async (page: number, categoryId?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (categoryId && categoryId !== "all") {
        params.set("categoryId", categoryId);
      }
      const res = await fetch(`/api/forum?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setThreads(data.threads);
      setPagination(data.pagination);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadThreads(1, activeTab);
  }, [activeTab, loadThreads]);

  function handlePageChange(page: number) {
    loadThreads(page, activeTab);
  }

  function handleTabChange(tabId: string) {
    setActiveTab(tabId);
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
      loadThreads(1, activeTab);
    } catch {
      setCreateError("Network error");
    } finally {
      setCreating(false);
    }
  }

  const tabs = [
    { id: "all", label: "All" },
    ...categories.map((c) => ({ id: c.id, label: c.name })),
  ];
  const activeCategoryLabel =
    activeTab === "all"
      ? "All desks"
      : categories.find((category) => category.id === activeTab)?.name ?? "Filtered";

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.community} />
      <PageIntro
        eyebrow="Community Desk"
        title="Forum"
        description="Use the discussion board as a live research floor for trade ideas, catalysts, and post-mortems instead of a generic message feed."
        actions={(
          <Button size="md" onClick={() => setShowNewThread(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New</span> Thread
          </Button>
        )}
        stats={[
          { label: "Categories", value: categories.length || "Loading" },
          { label: "Threads", value: loading ? "Loading" : pagination.total, tone: "brand" },
          { label: "View", value: activeCategoryLabel },
        ]}
      />

      <Tabs tabs={tabs} activeTab={activeTab} onChange={handleTabChange} />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="animate-pulse h-20">{null}</Card>
          ))}
        </div>
      ) : threads.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-12 w-12" />}
          title="No threads yet"
          description={
            activeTab === "all"
              ? "Be the first to start a discussion."
              : "No threads in this category yet."
          }
          action={{
            label: "New Thread",
            onClick: () => setShowNewThread(true),
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
            onPageChange={handlePageChange}
          />
        </div>
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
          <Select
            label="Category"
            value={newCategoryId}
            onChange={(value) => setNewCategoryId(value)}
            placeholder="Select a category"
            options={categories.map((c) => ({
              value: c.id,
              label: c.name,
            }))}
          />
          <Textarea
            label="Body"
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="What's on your mind?"
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
              disabled={!newTitle.trim() || !newBody.trim() || !newCategoryId || creating}
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
