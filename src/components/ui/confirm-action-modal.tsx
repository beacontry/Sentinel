"use client";

import { useCallback, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal, ModalTitle, ModalDescription, ModalFooter } from "./modal";
import { Button } from "./button";
import { Input } from "./input";

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
  /**
   * Rows of the numbers being acted on. Values render font-mono. `tone`
   * colours a string value and states nothing; a gain or loss row passes
   * a SignedValue as its value instead, which prints the glyph and word
   * from the figure itself (flat has neither, unknown prints n/a).
   */
  summary?: { label: string; value: ReactNode; tone?: "default" | "bullish" | "bearish" }[];
  /** Label for the confirm button, e.g. "Flatten 11 positions". */
  confirmLabel: string;
  /**
   * danger (the default): the everyday destructive button, on the loss
   * triplet. primary: a confirm that is not destructive. irreversible:
   * the solid danger fill, kept for the one action that cannot be undone
   * and moves real money (a LIVE order, a book-wide liquidation).
   */
  tone?: "danger" | "primary" | "irreversible";
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

type SummaryRow = NonNullable<ConfirmActionSpec["summary"]>[number];

/**
 * The numbers being acted on. The dialog is bg-surface, so the summary
 * sinks one step to bg-primary and keeps a container edge: these rows are
 * the quantity and price of an irreversible action and must read as one
 * bounded group, which a same-fill block cannot.
 */
export function ConfirmSummary({ rows }: { rows: SummaryRow[] }) {
  return (
    <dl className="my-4 divide-y divide-[var(--color-hairline-inner)] rounded-lg border border-border bg-bg-primary">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <dt className="text-text-secondary">{row.label}</dt>
          <dd className={`font-mono font-medium tabular-nums ${SUMMARY_TONE[row.tone ?? "default"]}`}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

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
  const confirmVariant = spec?.tone === "irreversible" ? "danger" : danger ? "destructive" : "primary";

  return (
    <Modal open={spec !== null} onClose={close}>
      {spec && (
        <>
          <div className="flex items-start gap-3 mb-3">
            {danger && (
              <div aria-hidden="true" className="shrink-0 rounded-lg bg-bearish-fill p-2 mt-0.5 text-bearish-fg">
                <AlertTriangle className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <ModalTitle>{spec.title}</ModalTitle>
              <ModalDescription className="mt-1 leading-relaxed">{spec.description}</ModalDescription>
            </div>
          </div>

          {spec.summary && spec.summary.length > 0 && <ConfirmSummary rows={spec.summary} />}

          {spec.typedKeyword && (
            <div className="my-4">
              <Input
                label={`Type ${spec.typedKeyword} to confirm`}
                id="confirm-keyword"
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="font-mono"
                autoFocus
              />
            </div>
          )}

          {/* Mounted while the dialog is open, so the first error is announced. */}
          <p role="alert" className="mt-2 text-sm text-bearish empty:mt-0">
            {error ?? ""}
          </p>

          <ModalFooter>
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={confirmVariant}
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
