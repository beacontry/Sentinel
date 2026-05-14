"use client";

// One-time click-through acceptance modal for ToS + Risk Disclosure.
// Fetches state on mount; if the user hasn't accepted the current
// version, blocks the dashboard with a non-dismissible modal until
// they tick the box and click "I agree."
//
// Bumping TERMS_VERSION in src/lib/terms-version.ts re-prompts every
// user on next dashboard load. The audit log records each acceptance
// with the version + timestamp.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal, ModalHeader, ModalTitle, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface TermsStatus {
  accepted: boolean;
  version: string | null;
  acceptedAt: string | null;
  current: string;
}

export function TermsAcceptanceModal() {
  const [status, setStatus] = useState<TermsStatus | null>(null);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/terms")
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data: TermsStatus = await res.json();
        setStatus(data);
      })
      .catch(() => {
        // If the call fails we don't gate the dashboard — better to let
        // the user in than block them on a transient error
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status || status.accepted) return null;

  async function accept() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/me/terms", { method: "POST" });
      if (res.ok) {
        setStatus({ ...status!, accepted: true, version: status!.current });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const hasOlderVersion = !!status.version && status.version !== status.current;

  return (
    <Modal open onClose={() => { /* non-dismissible */ }} className="max-w-lg">
      <ModalHeader>
        <ModalTitle>
          {hasOlderVersion ? "Updated terms" : "Terms of Service & Risk Disclosure"}
        </ModalTitle>
      </ModalHeader>
      <div className="px-5 pb-2 space-y-4">
        {hasOlderVersion && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 text-warning mt-0.5" />
            <p className="text-text-secondary m-0">
              The terms have been updated since you last accepted ({status.version}).
              Please review and re-confirm to continue using Beacontry.
            </p>
          </div>
        )}
        <p className="text-sm text-text-secondary">
          Beacontry is a tool, not a financial advisor. Signals, AI commentary,
          backtest results, and automated trading are{" "}
          <strong className="text-text-primary">for informational purposes only</strong>
          {" "}and not investment advice. Trading involves substantial risk of loss.
        </p>
        <p className="text-sm text-text-secondary">
          By continuing you confirm you have read and agree to the{" "}
          <Link
            href="/terms"
            target="_blank"
            className="text-accent hover:text-accent-hover underline"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            href="/risk"
            target="_blank"
            className="text-accent hover:text-accent-hover underline"
          >
            Risk Disclosure
          </Link>
          .
        </p>
        <label className="flex items-start gap-2.5 rounded-lg border border-border bg-bg-secondary p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-accent focus:ring-accent"
          />
          <span className="text-sm text-text-secondary">
            I have read both documents and I take sole responsibility for trades placed through Beacontry, including those placed by the automated engine.
          </span>
        </label>
      </div>
      <ModalFooter>
        <Button
          variant="ghost"
          onClick={async () => {
            // "Sign out" escape valve so users who refuse can leave cleanly
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
        >
          Sign out
        </Button>
        <Button
          onClick={accept}
          disabled={!checked || submitting}
          loading={submitting}
        >
          I agree
        </Button>
      </ModalFooter>
    </Modal>
  );
}
