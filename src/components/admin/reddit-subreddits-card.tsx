"use client";

// Admin card for managing the subreddit list that powers the Reddit
// ticker-mention feed (Analysis → Reddit tab). CRUDs against
// /api/admin/reddit-subreddits. Adding/toggling/deleting writes a
// hash-chained audit row and flushes the in-memory cache so the
// next user fetch sees the new set.

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { MessagesSquare, Plus, Trash2 } from "lucide-react";

interface Subreddit {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  weight: string; // numeric arrives as string from drizzle/pg
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export function RedditSubredditsCard() {
  const [subs, setSubs] = useState<Subreddit[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  // Add-form state
  const [newName, setNewName] = useState("");
  const [newWeight, setNewWeight] = useState("1.00");
  const [newDescription, setNewDescription] = useState("");

  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reddit-subreddits");
      if (res.ok) {
        const data = await res.json();
        setSubs(data.subreddits ?? []);
      }
    } catch {
      // Surface via toast — admins notice fast and a stale list isn't
      // a security issue
      toast({ type: "error", message: "Could not load subreddits." });
    } finally {
      setLoading(false);
    }
    // toast is stable from context; safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addSubreddit(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || adding) return;

    const weight = Number(newWeight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 2) {
      toast({ type: "error", message: "Weight must be between 0 and 2." });
      return;
    }

    setAdding(true);
    try {
      const res = await fetch("/api/admin/reddit-subreddits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || undefined,
          weight,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          type: "error",
          message:
            typeof data.error === "string"
              ? data.error
              : `Couldn't add subreddit (HTTP ${res.status}).`,
        });
        return;
      }

      toast({ type: "success", message: `Added r/${newName.trim()}` });
      setNewName("");
      setNewWeight("1.00");
      setNewDescription("");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network error";
      toast({ type: "error", message: `Couldn't add subreddit: ${msg}` });
    } finally {
      setAdding(false);
    }
  }

  async function toggleEnabled(sub: Subreddit) {
    // Optimistic flip — revert if the PATCH fails. Keeps the toggle
    // feeling responsive without leaving the UI in a wrong state on
    // network failures.
    setSubs((prev) =>
      prev.map((s) => (s.id === sub.id ? { ...s, enabled: !s.enabled } : s))
    );
    try {
      const res = await fetch("/api/admin/reddit-subreddits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sub.id, enabled: !sub.enabled }),
      });
      if (!res.ok) {
        // Revert
        setSubs((prev) =>
          prev.map((s) => (s.id === sub.id ? { ...s, enabled: sub.enabled } : s))
        );
        toast({ type: "error", message: `Could not toggle r/${sub.name}` });
      }
    } catch {
      setSubs((prev) =>
        prev.map((s) => (s.id === sub.id ? { ...s, enabled: sub.enabled } : s))
      );
      toast({ type: "error", message: `Could not toggle r/${sub.name}` });
    }
  }

  async function updateWeight(sub: Subreddit, weight: number) {
    if (!Number.isFinite(weight) || weight < 0 || weight > 2) return;
    try {
      const res = await fetch("/api/admin/reddit-subreddits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sub.id, weight }),
      });
      if (res.ok) {
        await load();
      } else {
        toast({ type: "error", message: `Could not update weight for r/${sub.name}` });
      }
    } catch {
      toast({ type: "error", message: `Could not update weight for r/${sub.name}` });
    }
  }

  async function deleteSubreddit(sub: Subreddit) {
    if (!confirm(`Remove r/${sub.name} from the Reddit feed?`)) return;
    try {
      const res = await fetch(
        `/api/admin/reddit-subreddits?id=${encodeURIComponent(sub.id)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        toast({ type: "success", message: `Removed r/${sub.name}` });
        await load();
      } else {
        toast({ type: "error", message: `Could not remove r/${sub.name}` });
      }
    } catch {
      toast({ type: "error", message: `Could not remove r/${sub.name}` });
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <MessagesSquare className="w-5 h-5 text-accent" />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Reddit Subreddits
            </h3>
            <p className="text-xs text-text-muted">
              Sources for the Analysis page&apos;s Reddit ticker-mention feed. Lower the
              weight to down-weight noisy subs in the sentiment aggregator without
              removing them entirely.
            </p>
          </div>
        </div>

        {/* Add form */}
        <form
          onSubmit={addSubreddit}
          className="grid gap-2 sm:grid-cols-[1fr_120px_180px_auto]"
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
            placeholder="subreddit name (no r/)"
            maxLength={32}
            aria-label="Subreddit name"
          />
          <Input
            value={newWeight}
            onChange={(e) => setNewWeight(e.target.value)}
            placeholder="1.00"
            inputMode="decimal"
            aria-label="Sentiment weight"
            help="0–2. Higher = more authoritative. Lower = noisier sub, less weight in sentiment aggregator."
          />
          <Input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Optional note"
            maxLength={280}
            aria-label="Description"
          />
          <Button type="submit" loading={adding} disabled={!newName.trim()}>
            <Plus className="w-4 h-4" />
            Add
          </Button>
        </form>

        {/* List */}
        {loading ? (
          <p className="text-xs text-text-muted">Loading subreddits…</p>
        ) : subs.length === 0 ? (
          <p className="text-xs text-text-muted italic">
            No subreddits yet. Add one above to start surfacing Reddit mentions
            on the Analysis page.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="pb-2 pr-3 font-medium text-xs">Subreddit</th>
                  <th className="pb-2 pr-3 font-medium text-xs">Description</th>
                  <th className="pb-2 pr-3 font-medium text-xs">Weight</th>
                  <th className="pb-2 pr-3 font-medium text-xs">Enabled</th>
                  <th className="pb-2 font-medium text-xs text-right"></th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors"
                  >
                    <td className="py-2 pr-3">
                      <div className="flex flex-col">
                        <a
                          href={`https://reddit.com/r/${s.name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-accent hover:underline"
                        >
                          r/{s.name}
                        </a>
                        {s.displayName !== `r/${s.name}` && (
                          <span className="text-[10px] text-text-muted">
                            {s.displayName}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-xs text-text-secondary">
                      {s.description || (
                        <span className="text-text-muted italic">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        max={2}
                        defaultValue={s.weight}
                        onBlur={(e) => {
                          const next = Number(e.target.value);
                          if (Number.isFinite(next) && next !== Number(s.weight)) {
                            updateWeight(s, next);
                          }
                        }}
                        className="w-20 rounded-md border border-border bg-bg-elevated px-2 py-1 font-mono text-xs text-text-primary focus:outline-none focus:border-accent/50"
                        aria-label={`Weight for r/${s.name}`}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <Toggle
                          checked={s.enabled}
                          onCheckedChange={() => toggleEnabled(s)}
                          aria-label={`Enable r/${s.name}`}
                        />
                        <Badge variant={s.enabled ? "bullish" : "neutral"}>
                          {s.enabled ? "On" : "Off"}
                        </Badge>
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteSubreddit(s)}
                        aria-label={`Remove r/${s.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-bearish" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
