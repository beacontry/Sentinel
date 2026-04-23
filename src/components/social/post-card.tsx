"use client";

import { useState } from "react";
import { Heart, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RichText } from "@/components/social/rich-text";
import { TradeShareCard, type SharedTrade } from "@/components/social/trade-share-card";

interface PostCardProps {
  id: string;
  content: string;
  symbol?: string | null;
  createdAt: string;
  authorName: string;
  userId: string;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  sharedTrade?: SharedTrade | null;
  onClick?: () => void;
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

export function PostCard({
  id,
  content,
  symbol,
  createdAt,
  authorName,
  likeCount: initialLikeCount,
  commentCount,
  liked: initialLiked,
  sharedTrade,
  onClick,
}: PostCardProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [liking, setLiking] = useState(false);

  async function handleLike(e: React.MouseEvent) {
    e.stopPropagation();
    if (liking) return;
    setLiking(true);

    // Optimistic update
    setLiked(!liked);
    setLikeCount((c) => (liked ? c - 1 : c + 1));

    try {
      const res = await fetch(`/api/social/posts/${id}/like`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setLiked(data.liked);
        setLikeCount(data.likeCount);
      } else {
        // Revert on error
        setLiked(liked);
        setLikeCount(initialLikeCount);
      }
    } catch {
      setLiked(liked);
      setLikeCount(initialLikeCount);
    } finally {
      setLiking(false);
    }
  }

  return (
    <Card
      hover
      className="cursor-pointer"
      onClick={onClick}
    >
      <div className="flex gap-3">
        <Avatar name={authorName} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-text-primary truncate">
              {authorName}
            </span>
            <span className="text-xs text-text-muted shrink-0">
              {relativeTime(createdAt)}
            </span>
          </div>
          <div className="text-sm text-text-secondary whitespace-pre-wrap break-words mb-2">
            <RichText content={content} />
          </div>
          {symbol && (
            <div className="mb-2">
              <Badge variant="default">${symbol}</Badge>
            </div>
          )}
          {sharedTrade && <TradeShareCard trade={sharedTrade} />}
          <div className="flex items-center gap-4">
            <button
              onClick={handleLike}
              className={`inline-flex items-center gap-1.5 text-xs transition-colors duration-150
                min-h-[44px] px-2 rounded-lg cursor-pointer
                ${liked
                  ? "text-bearish hover:text-bearish/80"
                  : "text-text-muted hover:text-text-secondary"
                }`}
              aria-label={liked ? "Unlike" : "Like"}
            >
              <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
              <span>{likeCount}</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onClick?.(); }}
              className="inline-flex items-center gap-1.5 text-xs text-text-muted
                hover:text-text-secondary transition-colors duration-150
                min-h-[44px] px-2 rounded-lg cursor-pointer"
              aria-label="Comments"
            >
              <MessageSquare className="h-4 w-4" />
              <span>{commentCount}</span>
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
