"use client";

import { useState } from "react";
import { BookOpen, ExternalLink, Loader2, Save } from "lucide-react";
import { Modal, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import Link from "next/link";

interface PostMortemContextSnapshot {
  entryFillPrice: number;
  exitFillPrice: number;
  quantity: number;
  realizedPnl: number;
  returnPct: number;
  rMultiple: number | null;
  holdDurationDisplay: string;
}

interface PostMortemResponse {
  tradeId: string;
  symbol: string;
  markdown: string;
  tokensUsed: number;
  generatedAt: string;
  journalEntryId: string | null;
  context: PostMortemContextSnapshot;
}

interface PostMortemButtonProps {
  tradeId: string;
  /** Only shown for closing actions; hidden otherwise. */
  action: string;
}

/**
 * Lightweight markdown renderer for the post-mortem panel — handles the 4
 * `##` section headings the prompt asks for plus paragraph wrapping. No
 * full markdown parser dependency.
 */
function MarkdownLite({ source }: { source: string }) {
  const blocks: { kind: "h2" | "p" | "li"; text: string }[] = [];
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("## ")) {
      blocks.push({ kind: "h2", text: trimmed.slice(3) });
    } else if (trimmed.startsWith("- ")) {
      blocks.push({ kind: "li", text: trimmed.slice(2) });
    } else {
      blocks.push({ kind: "p", text: trimmed });
    }
  }
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        if (b.kind === "h2") {
          return (
            <h3
              key={i}
              className="text-sm font-semibold text-text-primary mt-4 first:mt-0"
            >
              {b.text}
            </h3>
          );
        }
        if (b.kind === "li") {
          return (
            <p
              key={i}
              className="text-sm text-text-secondary leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-1 before:text-text-muted"
            >
              {b.text}
            </p>
          );
        }
        return (
          <p key={i} className="text-sm text-text-secondary leading-relaxed">
            {b.text}
          </p>
        );
      })}
    </div>
  );
}

export function PostMortemButton({ tradeId, action }: PostMortemButtonProps) {
  const isClosing = action === "SELL" || action === "manual_close";
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<PostMortemResponse | null>(null);
  const { toast } = useToast();

  if (!isClosing) return null;

  async function generate() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/trader/trades/${tradeId}/post-mortem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saveToJournal: false }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({
          type: "error",
          message:
            body?.error ??
            `Post-mortem failed (${res.status}). Try again or check System Config.`,
        });
        return;
      }
      const data = (await res.json()) as PostMortemResponse;
      setResult(data);
    } catch (err) {
      toast({
        type: "error",
        message:
          "Post-mortem failed — " +
          ((err as Error)?.message ?? "network error"),
      });
    } finally {
      setLoading(false);
    }
  }

  async function saveToJournal() {
    setSaving(true);
    try {
      const res = await fetch(`/api/trader/trades/${tradeId}/post-mortem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saveToJournal: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({
          type: "error",
          message: body?.error ?? `Save failed (${res.status}).`,
        });
        return;
      }
      const data = (await res.json()) as PostMortemResponse;
      setResult(data);
      toast({ type: "success", message: "Saved to journal." });
    } catch (err) {
      toast({
        type: "error",
        message:
          "Save failed — " + ((err as Error)?.message ?? "network error"),
      });
    } finally {
      setSaving(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    if (!result) void generate();
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded
          text-text-muted hover:text-accent hover:bg-accent/10
          transition-colors inline-flex items-center gap-1"
        title="Generate a multi-paragraph post-mortem"
      >
        <BookOpen className="h-3 w-3" />
        Post-mortem
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        className="max-w-2xl w-full"
      >
        <ModalHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-accent" />
            <ModalTitle>
              {result ? `${result.symbol} post-mortem` : "Post-mortem"}
            </ModalTitle>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            AI-generated analysis based on your fills, signals, and stop. Save
            it to the journal to keep the lesson.
          </p>
        </ModalHeader>

        {loading && (
          <div className="flex items-center justify-center py-10 text-text-secondary text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Generating…
          </div>
        )}

        {result && !loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Stat
                label="Entry / Exit"
                value={`$${result.context.entryFillPrice.toFixed(2)} → $${result.context.exitFillPrice.toFixed(2)}`}
              />
              <Stat
                label="P&L"
                value={`${result.context.realizedPnl >= 0 ? "+" : "-"}$${Math.abs(result.context.realizedPnl).toFixed(2)}`}
                tone={result.context.realizedPnl >= 0 ? "bullish" : "bearish"}
              />
              <Stat
                label="Return"
                value={`${result.context.returnPct >= 0 ? "+" : "-"}${Math.abs(result.context.returnPct * 100).toFixed(2)}%`}
                tone={result.context.returnPct >= 0 ? "bullish" : "bearish"}
              />
              <Stat
                label="R-multiple"
                value={
                  result.context.rMultiple === null
                    ? "—"
                    : `${result.context.rMultiple >= 0 ? "+" : ""}${result.context.rMultiple.toFixed(2)}R`
                }
                tone={
                  result.context.rMultiple === null
                    ? "neutral"
                    : result.context.rMultiple >= 0
                      ? "bullish"
                      : "bearish"
                }
              />
            </div>
            <div className="text-[11px] text-text-muted">
              Held {result.context.holdDurationDisplay} · {result.context.quantity} shares
            </div>
            <div className="rounded-lg border border-border bg-bg-secondary p-4 max-h-[400px] overflow-y-auto">
              <MarkdownLite source={result.markdown} />
            </div>
            {result.journalEntryId && (
              <Link
                href="/dashboard/journal"
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                View in journal
              </Link>
            )}
          </div>
        )}

        <ModalFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
          {result && !result.journalEntryId && (
            <Button
              variant="primary"
              size="sm"
              onClick={saveToJournal}
              loading={saving}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Save to Journal
            </Button>
          )}
        </ModalFooter>
      </Modal>
    </>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "bullish" | "bearish";
}) {
  const toneClass =
    tone === "bullish"
      ? "text-bullish"
      : tone === "bearish"
        ? "text-bearish"
        : "text-text-primary";
  return (
    <div className="rounded-lg bg-bg-elevated p-2">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-sm font-semibold ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}
