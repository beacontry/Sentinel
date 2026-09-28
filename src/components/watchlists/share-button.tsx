"use client";

import { useState } from "react";
import { Copy, Link2Off, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useConfirmAction } from "@/components/ui/confirm-action-modal";

/**
 * Public-share toggle. With no token, Share link generates one and copies
 * the URL; with one, Copy link copies it and the revoke button (after a
 * confirmation) withdraws it. Rotation is revoke, then share again.
 *
 * Moved out of the Watchlists page unchanged in behaviour.
 */
export function ShareButton({
  watchlistId,
  shareToken,
  onChanged,
}: {
  watchlistId: string;
  shareToken: string | null;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { requestConfirm, dialog: confirmDialog } = useConfirmAction();
  const [submitting, setSubmitting] = useState(false);

  function getUrl(token: string): string {
    if (typeof window === "undefined") return `/w/${token}`;
    return `${window.location.origin}/w/${token}`;
  }

  async function generate() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/watchlists/${watchlistId}/share`, { method: "POST" });
      if (!res.ok) {
        toast.toast({ type: "error", message: "Could not generate share link." });
        return;
      }
      const data = await res.json();
      const url = getUrl(data.shareToken);
      try {
        await navigator.clipboard.writeText(url);
        toast.toast({ type: "success", message: "Share link copied to clipboard." });
      } catch {
        toast.toast({ type: "success", message: `Share link: ${url}` });
      }
      onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  async function copy() {
    if (!shareToken) return;
    const url = getUrl(shareToken);
    try {
      await navigator.clipboard.writeText(url);
      toast.toast({ type: "success", message: "Link copied." });
    } catch {
      toast.toast({ type: "info", message: url });
    }
  }

  function revoke() {
    requestConfirm({
      title: "Revoke share link",
      description: <>Anyone holding the current link loses access immediately. You can generate a fresh link afterwards.</>,
      confirmLabel: "Revoke link",
      onConfirm: async () => {
        setSubmitting(true);
        try {
          const res = await fetch(`/api/watchlists/${watchlistId}/share`, { method: "DELETE" });
          if (!res.ok) throw new Error("Could not revoke share.");
          toast.toast({ type: "success", message: "Share link revoked." });
          onChanged();
        } finally {
          setSubmitting(false);
        }
      },
    });
  }

  if (!shareToken) {
    return (
      <Button variant="secondary" size="sm" onClick={generate} loading={submitting}>
        <Share2 className="h-4 w-4" aria-hidden="true" />
        Share link
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="secondary" size="sm" onClick={copy}>
        <Copy className="h-4 w-4" aria-hidden="true" />
        Copy link
      </Button>
      <Button variant="ghost" size="sm" onClick={revoke} loading={submitting} className="w-9 px-0" aria-label="Revoke share link">
        <Link2Off className="h-4 w-4" aria-hidden="true" />
      </Button>
      {confirmDialog}
    </div>
  );
}
