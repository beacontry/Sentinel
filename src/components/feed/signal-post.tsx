"use client";

import type { FeedPost } from "@/types";
import { Card } from "../ui/card";
import { SignalBadge } from "../ui/signal-badge";
import { Heart, MessageCircle, Clock } from "lucide-react";
import { useState } from "react";

interface SignalPostProps {
  post: FeedPost;
  onLike?: (postId: string) => void;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function SignalPost({ post, onLike }: SignalPostProps) {
  const [liked, setLiked] = useState(post.liked);
  const [likeCount, setLikeCount] = useState(post.likes);

  function handleLike() {
    setLiked(!liked);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
    onLike?.(post.id);
  }

  return (
    <Card className="animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
            <span className="text-accent font-display font-bold text-sm">
              {post.userName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium">{post.userName}</p>
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <Clock className="w-3 h-3" />
              {timeAgo(post.createdAt)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium">{post.symbol}</span>
          <SignalBadge signal={post.signal} />
        </div>
      </div>

      {/* Signal summary */}
      <p className="text-sm text-text-secondary leading-relaxed mb-2">
        {post.plainEnglish}
      </p>

      {/* User comment */}
      {post.comment && (
        <div className="bg-bg-elevated rounded-lg px-3 py-2 mb-3 border border-accent/20">
          <p className="text-sm text-text-primary">{post.comment}</p>
        </div>
      )}

      {/* Price + confidence */}
      <div className="flex items-center gap-4 mb-3 text-xs text-text-muted">
        <span className="font-mono">
          ${post.price.toFixed(2)}
        </span>
        <span>{Math.round(post.confidence * 100)}% confidence</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 pt-2 border-t border-border">
        <button
          onClick={handleLike}
          className={`flex items-center gap-1.5 text-sm transition-colors min-h-[36px]
            ${liked ? "text-bearish" : "text-text-muted hover:text-bearish"}`}
        >
          <Heart className={`w-4 h-4 ${liked ? "fill-current" : ""}`} />
          {likeCount > 0 && <span>{likeCount}</span>}
        </button>
        <span className="flex items-center gap-1.5 text-sm text-text-muted">
          <MessageCircle className="w-4 h-4" />
        </span>
      </div>
    </Card>
  );
}
