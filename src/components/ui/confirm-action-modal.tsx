"use client";

import { useCallback, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal, ModalTitle, ModalDescription, ModalFooter } from "./modal";
import { Button } from "./button";

/**
 * Crisis-path confirmation (2026-07-15). Replaces the browser-native
 * `confirm()` / `alert()` pair on every money-moving or destructive action.
 *
 * Why this exists: at the single highest-anxiety moment (emergency halt,
 * flatten-all mid-drawdown) the product's voice used to become the OS's —
 * a system dialog with no position count, no notional, and a raw
 * `alert("Failed: ...")` on error. Design review 2026-07-14, P1.
 *
 * Anatomy:
 *  - title + description: exactly what WILL and WON'T happen
 *  - summary rows: the numbers the user is about to act on (N positions,
 *    est. notional, unrealized P&L) — rendered font-mono per design system
 *  - optional typed keyword: for the largest irreversible actions
 *    (flatten-all). Deliberately NOT used on Halt — it's the emergency
 *    button; friction there defeats its purpose.
 *  - busy state while `onConfirm` runs; a thrown error renders inline and
 *    keeps the dialog open so the user never loses context.
 */

export interface ConfirmActionSpec {
  title: string;
  /** What will and won't happen. Be explicit — this is the contract. */
  description: ReactNode;
  /** Rows of the numbers being acted on. Values render font-mono. */
  summary?: { label: string; value: string; tone?: "default" | "bullish" | "bearish" }[];
  /** Label for the confirm button, e.g. "Flatten 11 positions". */
  confirmLabel: string;
  tone?: "danger" | "primary";
  /** Require typing this keyword (case-insensitive) to enable confirm. */
  typedKeyword?: string;
  /** Runs on confirm. Throw to keep the dialog open with an inline error. */
  onConfirm: () => Promise<void> | void;
}

const SUMMARY_TONE: Record<NonNullable<ConfirmActionSpec["summary"]>[number]["tone"] & string, string> = {
  default: "text-text-primary",
  bullish: "text-bullish",
  bearish: "text-bearish",
};

export function ConfirmActionModal({
  spec,
  onClose,
}: {
  spec: ConfirmActionSpec | null;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return; // don't allow dismiss mid-flight — the order is being placed
    setTyped("");
    setError(null);
    onClose();
  };

  const keywordOk =
    !spec?.typedKeyword || typed.trim().toUpperCase() === spec.typedKeyword.toUpperCase();

  const handleConfirm = async () => {
    if (!spec || !keywordOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      await spec.onConfirm();
      setTyped("");
      setBusy(false);
      onClose();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "The action failed — nothing was changed.");
    }
  };

  const danger = spec?.tone !== "primary";

  return (
    <Modal open={spec !== null} onClose={close}>
      {spec && (
        <>
          <div className="flex items-start gap-3 mb-3">
            {danger && (
              <div className="shrink-0 rounded-lg bg-bearish/10 p-2 mt-0.5">
                <AlertTriangle className="w-5 h-5 text-bearish" />
              </div>
            )}
            <div className="min-w-0">
              <ModalTitle>{spec.title}</ModalTitle>
              <ModalDescription className="mt-1 leading-relaxed">{spec.description}</ModalDescription>
            </div>
          </div>

          {spec.summary && spec.summary.length > 0 && (
            <div className="rounded-lg border border-border bg-bg-primary/50 divide-y divide-border/50 my-4">
              {spec.summary.map((row) => (
                <div key={row.label} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-text-muted">{row.label}</span>
                  <span className={`font-mono font-medium ${SUMMARY_TONE[row.tone ?? "default"]}`}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {spec.typedKeyword && (
            <div className="my-4">
              <label className="block text-xs text-text-muted mb-1.5">
                Type <span className="font-mono font-semibold text-text-primary">{spec.typedKeyword}</span> to confirm
              </label>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="w-full min-h-[44px] rounded-lg border border-border bg-bg-surface px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:border-accent"
                autoFocus
              />
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-bearish mt-2">
              {error}
            </p>
          )}

          <ModalFooter>
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={danger ? "destructive" : "primary"}
              onClick={handleConfirm}
              disabled={!keywordOk || busy}
              loading={busy}
            >
              {spec.confirmLabel}
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}

/**
 * Page-level hook: one modal instance serves every confirmable action on the
 * page. `requestConfirm(spec)` opens it; render `{dialog}` once in the tree.
 *
 *   const { requestConfirm, dialog } = useConfirmAction();
 *   ...
 *   <Button onClick={() => requestConfirm({ title: "...", onConfirm: async () => {...} })} />
 *   ...
 *   {dialog}
 */
export function useConfirmAction() {
  const [spec, setSpec] = useState<ConfirmActionSpec | null>(null);
  const requestConfirm = useCallback((s: ConfirmActionSpec) => setSpec(s), []);
  const dialog = <ConfirmActionModal spec={spec} onClose={() => setSpec(null)} />;
  return { requestConfirm, dialog };
}
