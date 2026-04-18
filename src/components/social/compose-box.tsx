"use client";

import { useState, useRef } from "react";
import { Send, Hash } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ComposeBoxProps {
  onPost: (post: {
    id: string;
    content: string;
    symbol: string | null;
    createdAt: string;
    userId: string;
    authorName: string;
    likeCount: number;
    commentCount: number;
    liked: boolean;
  }) => void;
}

const MAX_CHARS = 500;

export function ComposeBox({ onPost }: ComposeBoxProps) {
  const [content, setContent] = useState("");
  const [symbol, setSymbol] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = content.length;
  const overLimit = charCount > MAX_CHARS;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || overLimit || posting) return;

    setPosting(true);
    setError("");

    try {
      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          symbol: symbol.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to post");
        return;
      }

      const data = await res.json();
      onPost(data.post);
      setContent("");
      setSymbol("");
      textareaRef.current?.focus();
    } catch {
      setError("Network error");
    } finally {
      setPosting(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What's on your mind? Share an analysis or trade idea..."
          rows={3}
          className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2.5
            text-sm text-text-primary placeholder:text-text-muted
            transition-colors duration-150 resize-y
            focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
                <Hash className="h-4 w-4" />
              </div>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase().slice(0, 10))}
                placeholder="Symbol"
                className="w-28 rounded-lg border border-border bg-bg-elevated pl-9 pr-3 py-2
                  text-sm text-text-primary placeholder:text-text-muted
                  transition-colors duration-150
                  focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
                  min-h-[44px]"
              />
            </div>
            <span
              className={`text-xs ${
                overLimit ? "text-bearish" : "text-text-muted"
              }`}
            >
              {charCount}/{MAX_CHARS}
            </span>
          </div>
          <Button
            type="submit"
            size="md"
            disabled={!content.trim() || overLimit || posting}
            loading={posting}
          >
            <Send className="h-4 w-4" />
            Post
          </Button>
        </div>
        {error && <p className="text-xs text-bearish">{error}</p>}
      </form>
    </Card>
  );
}
