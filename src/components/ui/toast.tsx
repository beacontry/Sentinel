"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { STATUS_TONE_CLASSES } from "@/lib/status-tone";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  traceId?: string;
}

interface ToastOptions {
  type: ToastType;
  message: string;
  duration?: number;
  /** The error envelope's trace ID, shown as a reference to quote to support. */
  traceId?: string | null;
}

interface ToastContextValue {
  /**
   * Show a toast. `duration: 0` makes it persistent (dismiss-only) — use for
   * errors carrying remediation info the user needs time to read. Error
   * toasts default to 10s (vs 5s for the rest); all toasts are dismissible.
   */
  toast: (opts: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** At most this many on screen; the oldest leaves first. */
export const MAX_TOASTS = 3;

// Tone from the one status map, plus an icon per kind, so a failure never
// shows the same shape as a success: colour is not the only difference.
const TOAST_STYLES: Record<ToastType, string> = {
  success: STATUS_TONE_CLASSES.bullish,
  error: STATUS_TONE_CLASSES.bearish,
  warning: STATUS_TONE_CLASSES.warning,
  info: "bg-bg-elevated border-border text-text-primary",
};

const TOAST_ICONS: Record<ToastType, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Latest message for each live region. The regions stay mounted and
  // only their text changes: a region inserted together with its message
  // is often not announced, which lost success and info toasts (order
  // confirmations) on screen readers.
  const [polite, setPolite] = useState<Toast | null>(null);
  const [assertive, setAssertive] = useState<Toast | null>(null);
  const idRef = useRef(0);
  // Auto-dismiss timers by toast id, so a manual dismiss (or the stack cap
  // pushing a toast out) clears its timer instead of leaving it to fire.
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const clearTimer = useCallback((id: number) => {
    const handle = timersRef.current.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      timersRef.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
      setPolite((prev) => (prev?.id === id ? null : prev));
      setAssertive((prev) => (prev?.id === id ? null : prev));
    },
    [clearTimer],
  );

  const addToast = useCallback(
    ({ type, message, duration, traceId }: ToastOptions) => {
      const id = ++idRef.current;
      const toast: Toast = { id, type, message, traceId: traceId ?? undefined };
      setToasts((prev) => {
        const next = [...prev, toast];
        const overflow = next.slice(0, Math.max(0, next.length - MAX_TOASTS));
        for (const old of overflow) clearTimer(old.id);
        return next.slice(-MAX_TOASTS);
      });
      if (type === "error") setAssertive(toast);
      else setPolite(toast);
      // Errors linger twice as long by default — they usually carry a reason
      // the user needs to actually read ("Failed: insufficient buying power").
      // duration 0 = persistent until dismissed.
      const ms = duration ?? (type === "error" ? 10000 : 5000);
      if (ms > 0) {
        timersRef.current.set(
          id,
          setTimeout(() => dismiss(id), ms),
        );
      }
    },
    [clearTimer, dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const handle of timers.values()) clearTimeout(handle);
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Keyed spans, so a repeat of the same message is a new node and
          is announced again. */}
      <div role="status" className="sr-only">
        {polite && <span key={polite.id}>{polite.message}</span>}
      </div>
      <div role="alert" className="sr-only">
        {assertive && (
          <span key={assertive.id}>
            {assertive.message}
            {assertive.traceId ? ` Reference ${assertive.traceId}.` : ""}
          </span>
        )}
      </div>
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+16px)] right-4 left-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:max-w-sm">
        {toasts.map((t) => {
          const Icon = TOAST_ICONS[t.type];
          return (
            <div
              key={t.id}
              className={`animate-slide-up flex w-full items-start gap-2 rounded-lg border py-2 pl-3 pr-1 text-sm shadow-pop ${TOAST_STYLES[t.type]}`}
            >
              <Icon className="mt-2.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1 py-2 leading-snug">
                <p className="break-words">{t.message}</p>
                {t.traceId && <p className="mt-1 font-mono text-xs">Reference: {t.traceId}</p>}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismiss(t.id)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
