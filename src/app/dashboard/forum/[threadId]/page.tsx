"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessageSquare, Eye, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";

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
}

interface Reply {
  id: string;
  body: string;
  parentReplyId: string | null;
  createdAt: string;
  userId: string;
  authorName: string;
}

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

export default function ThreadDetailPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = use(params);
  const router = useRouter();

  const [thread, setThread] = useState<Thread | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Reply form
  const [replyBody, setReplyBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyError, setReplyError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/forum/${threadId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Thread not found");
          } else {
            setError("Failed to load thread");
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setThread(data.thread);
          setReplies(data.replies);
        }
      } catch {
        if (!cancelled) setError("Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [threadId]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyBody.trim() || posting) return;

    setPosting(true);
    setReplyError("");

    try {
      const res = await fetch(`/api/forum/${threadId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyBody.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setReplyError(data.error || "Failed to post reply");
        return;
      }

      const data = await res.json();
      setReplies((prev) => [...prev, data.reply]);
      setReplyBody("");
    } catch {
      setReplyError("Network error");
    } finally {
      setPosting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <div className="">
          <Card className="animate-pulse h-40">{null}</Card>
        </div>
      </div>
    );
  }

  if (error || !thread) {
    return (
      <div className="p-4 lg:p-6">
        <div className=" mb-6">
          <Button
            variant="ghost"
            size="md"
            onClick={() => router.push("/dashboard/forum")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Forum
          </Button>
        </div>
        <EmptyState
          icon={<MessageSquare className="h-12 w-12" />}
          title={error || "Thread not found"}
          description="This thread may have been deleted."
          action={{
            label: "Back to Forum",
            onClick: () => router.push("/dashboard/forum"),
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="">
        <Button
          variant="ghost"
          size="md"
          onClick={() => router.push("/dashboard/forum")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Forum
        </Button>
      </div>

      {/* Thread Header */}
      <Card>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <Avatar name={thread.authorName} size="lg" className="shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 mb-1">
                <h1 className="font-display text-xl font-bold text-text-primary">
                  {thread.title}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted mb-3">
                <span className="font-medium text-text-secondary">
                  {thread.authorName}
                </span>
                <span>{relativeTime(thread.createdAt)}</span>
                <Badge variant="neutral">{thread.categoryName}</Badge>
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {thread.viewCount}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {replies.length}
                </span>
                {thread.locked && <Badge variant="warning">Locked</Badge>}
              </div>
              <p className="text-sm text-text-secondary whitespace-pre-wrap break-words">
                {thread.body}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Replies */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary mb-4">
          Replies ({replies.length})
        </h2>
        {replies.length === 0 ? (
          <div className="text-center py-8 text-sm text-text-muted">
            No replies yet. Be the first to reply.
          </div>
        ) : (
          <div className="space-y-3">
            {replies.map((reply) => (
              <Card key={reply.id}>
                <div className="flex gap-3">
                  <Avatar name={reply.authorName} size="sm" className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {reply.authorName}
                      </span>
                      <span className="text-xs text-text-muted shrink-0">
                        {relativeTime(reply.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-text-secondary whitespace-pre-wrap break-words">
                      {reply.body}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Reply Composer */}
      {!thread.locked ? (
        <Card>
          <form onSubmit={handleReply} className="space-y-3">
            <Textarea
              label="Reply"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Write your reply..."
              rows={3}
              maxLength={5000}
            />
            {replyError && <p className="text-xs text-bearish">{replyError}</p>}
            <div className="flex justify-end">
              <Button
                type="submit"
                size="md"
                disabled={!replyBody.trim() || posting}
                loading={posting}
              >
                <Send className="h-4 w-4" />
                Reply
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-text-muted text-center py-2">
            This thread is locked. No new replies can be added.
          </p>
        </Card>
      )}
    </div>
  );
}
