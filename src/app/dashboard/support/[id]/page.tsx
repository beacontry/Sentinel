"use client";

// Single-ticket thread view. Shows the full message history, lets the
// current user (or admin) post a new reply, and admins can change status
// or priority from the header.

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ArrowLeft, Send, Shield, User } from "lucide-react";

interface Ticket {
  id: string;
  userId: string;
  subject: string;
  status: "open" | "responded" | "resolved" | "closed";
  priority: "low" | "normal" | "high";
  createdAt: string;
  updatedAt: string;
  authorEmail: string;
  authorName: string;
}

interface Message {
  id: string;
  authorId: string;
  authorRole: "user" | "admin";
  body: string;
  createdAt: string;
}

const STATUS_VARIANT: Record<Ticket["status"], "bullish" | "bearish" | "warning" | "neutral"> = {
  open: "warning",
  responded: "bullish",
  resolved: "neutral",
  closed: "neutral",
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function SupportTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const toast = useToast();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/support/tickets/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setTicket(data.ticket);
        setMessages(data.messages ?? []);
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

  async function sendReply() {
    if (!reply.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/support/tickets/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.toast({
          type: "error",
          message: typeof data.error === "string" ? data.error : "Could not send reply.",
        });
        return;
      }
      setReply("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function patchTicket(payload: Partial<Pick<Ticket, "status" | "priority">>) {
    try {
      const res = await fetch(`/api/support/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.toast({ type: "error", message: "Could not update ticket." });
        return;
      }
      await load();
    } catch {
      toast.toast({ type: "error", message: "Could not update ticket." });
    }
  }

  if (notFound) {
    return (
      <div className="p-4 lg:p-6 max-w-3xl mx-auto">
        <Link href="/dashboard/support" className="text-text-muted hover:text-text-primary">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <p className="mt-6 text-center text-sm text-text-muted">Ticket not found.</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/support" className="text-text-muted hover:text-text-primary">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <p className="text-sm text-text-muted">Support</p>
      </div>

      {loading || !ticket ? (
        <div className="space-y-3">
          <Skeleton className="h-20" rounded="lg" />
          <Skeleton className="h-32" rounded="lg" />
        </div>
      ) : (
        <>
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold text-text-primary">{ticket.subject}</h1>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge variant={STATUS_VARIANT[ticket.status]}>{ticket.status}</Badge>
                  <Badge variant="neutral">{ticket.priority}</Badge>
                  <span className="text-[11px] text-text-muted">
                    Opened {formatTimestamp(ticket.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-text-muted mt-1">
                  {ticket.authorName} · <span className="font-mono">{ticket.authorEmail}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={ticket.status}
                  onChange={(v) => patchTicket({ status: v as Ticket["status"] })}
                  options={[
                    { value: "open", label: "Open" },
                    { value: "responded", label: "Responded" },
                    { value: "resolved", label: "Resolved" },
                    { value: "closed", label: "Closed" },
                  ]}
                />
              </div>
            </div>
          </Card>

          {/* Thread */}
          <div className="space-y-3">
            {messages.map((m) => (
              <Card
                key={m.id}
                className={m.authorRole === "admin" ? "border-accent/30 bg-accent/5" : ""}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      m.authorRole === "admin"
                        ? "bg-accent/15 text-accent"
                        : "bg-bg-elevated text-text-muted"
                    }`}
                  >
                    {m.authorRole === "admin" ? (
                      <Shield className="w-4 h-4" />
                    ) : (
                      <User className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
                        {m.authorRole === "admin" ? "Sentinel team" : "You"}
                      </span>
                      <span className="text-[11px] text-text-muted">{formatTimestamp(m.createdAt)}</span>
                    </div>
                    <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                      {m.body}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Reply */}
          {ticket.status !== "closed" ? (
            <Card>
              <div className="space-y-3">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={4}
                  maxLength={8000}
                  placeholder="Reply…"
                  className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50"
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => patchTicket({ status: "closed" })}
                  >
                    Close ticket
                  </Button>
                  <Button onClick={sendReply} loading={submitting} disabled={!reply.trim()}>
                    <Send className="w-3.5 h-3.5" />
                    Send reply
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-text-muted text-center py-2">
                This ticket is closed. Open a new one if you need more help.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
