"use client";

// One-on-one DM thread view. Loads the thread, marks it as read on
// mount (the GET endpoint updates last_seen server-side), and lets the
// user post replies.

import { useEffect, useRef, useState, use } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Send } from "lucide-react";
import { SmartBackButton } from "@/components/ui/smart-back-button";

interface ThreadMeta {
  id: string;
  userAId: string;
  userBId: string;
  lastMessageAt: string;
}

interface Message {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

interface OtherUser {
  id: string;
  name: string;
  email: string;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function DmThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const toast = useToast();
  const [thread, setThread] = useState<ThreadMeta | null>(null);
  const [other, setOther] = useState<OtherUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // Use a ref to scroll-to-bottom on new messages without spamming on
  // every render
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/dm/threads/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setThread(data.thread);
        setOther(data.other);
        setMessages(data.messages ?? []);
        // Identify "me" — the user id that isn't the `other` field
        const me =
          data.thread.userAId === data.other?.id
            ? data.thread.userBId
            : data.thread.userAId;
        setMyId(me);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Scroll-to-bottom whenever the message list grows
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages]);

  async function sendReply() {
    if (!reply.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/dm/threads/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply.trim() }),
      });
      if (!res.ok) {
        toast.toast({ type: "error", message: "Could not send." });
        return;
      }
      setReply("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <div className="p-4 lg:p-6 max-w-3xl mx-auto">
        <SmartBackButton fallbackHref="/dashboard/messages" />
        <p className="mt-6 text-center text-sm text-text-muted">Thread not found.</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <SmartBackButton fallbackHref="/dashboard/messages" />
        <div className="min-w-0 flex-1">
          {loading || !other ? (
            <Skeleton className="h-5 w-32" rounded="sm" />
          ) : (
            <h1 className="text-lg font-semibold text-text-primary">{other.name}</h1>
          )}
        </div>
      </div>

      {loading || !thread ? (
        <div className="space-y-3">
          <Skeleton className="h-12" rounded="lg" />
          <Skeleton className="h-12 ml-12" rounded="lg" />
          <Skeleton className="h-12" rounded="lg" />
        </div>
      ) : (
        <div className="space-y-2 min-h-[400px]">
          {messages.length === 0 && (
            <p className="text-sm text-text-muted text-center py-12">
              No messages yet. Say hi.
            </p>
          )}
          {messages.map((m) => {
            const fromMe = m.authorId === myId;
            return (
              <div
                key={m.id}
                className={`flex ${fromMe ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                    fromMe
                      ? "bg-accent/15 border border-accent/30 text-text-primary"
                      : "bg-bg-elevated border border-border text-text-secondary"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.body}</p>
                  <p className="text-[10px] text-text-muted mt-1 text-right">
                    {formatTime(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      <Card>
        <div className="space-y-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter for newline
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendReply();
              }
            }}
            rows={2}
            maxLength={8000}
            placeholder={`Message ${other?.name ?? ""}…`}
            className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-muted">
              Enter to send · Shift+Enter for newline
            </span>
            <Button onClick={sendReply} loading={submitting} disabled={!reply.trim()} size="sm">
              <Send className="w-3.5 h-3.5" />
              Send
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
