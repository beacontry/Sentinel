"use client";

import Link from "next/link";
import { MessageSquare, Eye, Pin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface ThreadPreviewProps {
  id: string;
  title: string;
  authorName: string;
  categoryName: string;
  replyCount: number;
  viewCount: number;
  createdAt: string;
  lastReplyAt: string | null;
  pinned: boolean;
  locked: boolean;
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

export function ThreadPreview({
  id,
  title,
  authorName,
  categoryName,
  replyCount,
  viewCount,
  createdAt,
  lastReplyAt,
  pinned,
  locked,
}: ThreadPreviewProps) {
  return (
    <Link href={`/dashboard/forum/${id}`}>
      <Card hover className="block">
        <div className="flex gap-3">
          <Avatar name={authorName} size="md" className="shrink-0 hidden sm:block" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 mb-1">
              {pinned && (
                <Pin className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
              )}
              <h3 className="text-sm font-semibold text-text-primary truncate flex-1">
                {title}
              </h3>
              <Badge variant="neutral" className="shrink-0">
                {categoryName}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
              <span>{authorName}</span>
              <span>{relativeTime(createdAt)}</span>
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {replyCount}
              </span>
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {viewCount}
              </span>
              {lastReplyAt && (
                <span>Last reply {relativeTime(lastReplyAt)}</span>
              )}
              {locked && (
                <Badge variant="warning">Locked</Badge>
              )}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
