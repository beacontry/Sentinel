"use client";

import { useState, useEffect } from "react";
import { Send } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/social/rich-text";

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
  authorName: string;
}

interface CommentListProps {
  postId: string;
  initialComments?: Comment[];
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

export function CommentList({ postId, initialComments }: CommentListProps) {
  const [comments, setComments] = useState<Comment[]>(initialComments ?? []);
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(!initialComments);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialComments) return;

    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/social/posts/${postId}/comments`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setComments(data.comments);
      } catch {
        // Non-critical, silently ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [postId, initialComments]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || posting) return;

    setPosting(true);
    setError("");

    try {
      const res = await fetch(`/api/social/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to post comment");
        return;
      }

      const data = await res.json();
      setComments((prev) => [...prev, data.comment]);
      setContent("");
    } catch {
      setError("Network error");
    } finally {
      setPosting(false);
    }
  }

  if (loading) {
    return (
      <div className="py-4 text-center text-sm text-text-muted">
        Loading comments...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {comments.length > 0 && (
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <Avatar name={c.authorName} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-text-primary truncate">
                    {c.authorName}
                  </span>
                  <span className="text-xs text-text-muted shrink-0">
                    {relativeTime(c.createdAt)}
                  </span>
                </div>
                <div className="text-sm text-text-secondary whitespace-pre-wrap break-words">
                  <RichText content={c.content} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write a comment..."
          maxLength={1000}
          className="flex-1 rounded-lg border border-border bg-bg-elevated px-3 py-2
            text-sm text-text-primary placeholder:text-text-muted
            transition-colors duration-150
            focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
            min-h-[44px]"
        />
        <Button
          type="submit"
          variant="secondary"
          size="md"
          disabled={!content.trim() || posting}
          loading={posting}
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
      {error && <p className="text-xs text-bearish">{error}</p>}
    </div>
  );
}
