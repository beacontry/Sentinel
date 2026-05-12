"use client";

// Support ticket inbox. Users see their own tickets; admins see every
// open/responded ticket across all users. Clicking a row opens the
// detail thread at /dashboard/support/[id].

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { Modal, ModalHeader, ModalTitle, ModalFooter } from "@/components/ui/modal";
import { PageIntro } from "@/components/layout/page-intro";
import { LifeBuoy, Plus, MessageSquare } from "lucide-react";

interface TicketRow {
  id: string;
  userId: string;
  subject: string;
  status: "open" | "responded" | "resolved" | "closed";
  priority: "low" | "normal" | "high";
  createdAt: string;
  updatedAt: string;
  authorEmail: string;
  authorName: string;
  messageCount: number;
}

const STATUS_VARIANT: Record<TicketRow["status"], "bullish" | "bearish" | "warning" | "neutral"> = {
  open: "warning",
  responded: "bullish",
  resolved: "neutral",
  closed: "neutral",
};

const PRIORITY_VARIANT: Record<TicketRow["priority"], "bullish" | "bearish" | "neutral" | "warning"> = {
  low: "neutral",
  normal: "neutral",
  high: "bearish",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function SupportPage() {
  const toast = useToast();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/support/tickets");
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets ?? []);
        setIsAdmin(data.isAdmin === true);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function submit() {
    if (!subject.trim() || !body.trim()) {
      toast.toast({ type: "error", message: "Subject and message are required." });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim(), priority }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.toast({
          type: "error",
          message: typeof data.error === "string" ? data.error : "Could not open ticket.",
        });
        return;
      }
      toast.toast({ type: "success", message: "Ticket submitted." });
      setShowNew(false);
      setSubject("");
      setBody("");
      setPriority("normal");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl mx-auto">
      <PageIntro
        eyebrow="Help"
        title="Support"
        description={
          isAdmin
            ? "Triage open tickets and reply to users. Status flow: open → responded → resolved/closed."
            : "Submit a question, bug report, or request. We reply by email and in-app."
        }
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus className="w-4 h-4" />
            New ticket
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" rounded="lg" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy className="w-12 h-12" />}
          title={isAdmin ? "No tickets yet" : "No tickets yet"}
          description={
            isAdmin
              ? "When a user opens a support ticket it'll appear here."
              : "Have a question or hit a bug? Open a ticket and we'll get back to you."
          }
          action={{ label: "New ticket", onClick: () => setShowNew(true) }}
        />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left text-xs uppercase tracking-wide">
                  <th className="p-3 font-medium">Subject</th>
                  {isAdmin && <th className="p-3 font-medium">User</th>}
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Priority</th>
                  <th className="p-3 font-medium">Messages</th>
                  <th className="p-3 font-medium">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-border/50 hover:bg-bg-hover cursor-pointer transition-colors"
                  >
                    <td className="p-3" colSpan={isAdmin ? 1 : 1}>
                      <Link href={`/dashboard/support/${t.id}`} className="text-text-primary hover:text-accent font-medium">
                        {t.subject}
                      </Link>
                    </td>
                    {isAdmin && (
                      <td className="p-3 text-text-secondary">
                        {t.authorName}
                        <div className="text-[10px] text-text-muted">{t.authorEmail}</div>
                      </td>
                    )}
                    <td className="p-3">
                      <Badge variant={STATUS_VARIANT[t.status]}>{t.status}</Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant={PRIORITY_VARIANT[t.priority]}>{t.priority}</Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 text-text-secondary">
                        <MessageSquare className="w-3.5 h-3.5 text-text-muted" />
                        <span className="font-mono">{t.messageCount}</span>
                      </div>
                    </td>
                    <td className="p-3 text-xs text-text-muted whitespace-nowrap">
                      {formatDate(t.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* New ticket modal */}
      <Modal open={showNew} onClose={() => setShowNew(false)} className="max-w-xl">
        <ModalHeader>
          <ModalTitle>Open a support ticket</ModalTitle>
        </ModalHeader>
        <div className="px-5 pb-2 space-y-4">
          <Input
            label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Short summary"
            maxLength={200}
          />
          <Select
            label="Priority"
            value={priority}
            onChange={(v) => setPriority(v as "low" | "normal" | "high")}
            options={[
              { value: "low", label: "Low" },
              { value: "normal", label: "Normal" },
              { value: "high", label: "High — production issue / blocked" },
            ]}
          />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">Describe the issue</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              maxLength={8000}
              placeholder="What were you trying to do, what happened, and what did you expect? Steps to reproduce help."
              className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50"
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowNew(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting} disabled={!subject.trim() || !body.trim()}>
            Submit
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
