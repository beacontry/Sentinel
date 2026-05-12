"use client";

// DM inbox. Shows every thread the user participates in with the
// other user's name, last-message preview, last-message time, and
// unread badge count.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIntro } from "@/components/layout/page-intro";
import { MessageCircle } from "lucide-react";

interface DmThreadRow {
  id: string;
  lastMessageAt: string;
  userAId: string;
  userBId: string;
  otherUserName: string;
  otherUserEmail: string;
  lastMessageBody: string | null;
  unreadCount: number;
}

function timeAgo(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export default function MessagesPage() {
  const [threads, setThreads] = useState<DmThreadRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dm/threads")
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data = await res.json();
        setThreads(data.threads ?? []);
      })
      .catch(() => {
        // Non-critical
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totalUnread = threads.reduce((s, t) => s + (t.unreadCount ?? 0), 0);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-3xl mx-auto">
      <PageIntro
        eyebrow="Community"
        title="Messages"
        description="Private one-on-one threads with other Sentinel users."
        stats={[
          { label: "Threads", value: threads.length },
          { label: "Unread", value: totalUnread, tone: totalUnread > 0 ? "brand" : "neutral" },
        ]}
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" rounded="lg" />
          ))}
        </div>
      ) : threads.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="w-12 h-12" />}
          title="No messages yet"
          description="Find another user on the leaderboard or forum to start a conversation."
        />
      ) : (
        <div className="space-y-2">
          {threads.map((t) => (
            <Link
              key={t.id}
              href={`/dashboard/messages/${t.id}`}
              className="block"
            >
              <Card hover>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-text-primary truncate">
                        {t.otherUserName}
                      </h3>
                      {t.unreadCount > 0 && (
                        <Badge variant="bullish" className="text-[10px]">
                          {t.unreadCount} new
                        </Badge>
                      )}
                    </div>
                    {t.lastMessageBody && (
                      <p className="text-xs text-text-secondary mt-1 line-clamp-1">
                        {t.lastMessageBody}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-text-muted shrink-0">
                    {timeAgo(t.lastMessageAt)}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
