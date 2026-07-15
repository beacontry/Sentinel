"use client";

import { createContext, useCallback, useContext, useState, useRef } from "react";
import { X } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  /**
   * Show a toast. `duration: 0` makes it persistent (dismiss-only) — use for
   * errors carrying remediation info the user needs time to read. Error
   * toasts default to 10s (vs 5s for the rest); all toasts are dismissible.
   */
  toast: (opts: { type: ToastType; message: string; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_STYLES: Record<ToastType, string> = {
  success: "bg-bullish/10 border-bullish/30 text-bullish",
  error: "bg-bearish/10 border-bearish/30 text-bearish",
  warning: "bg-warning/10 border-warning/30 text-warning",
  info: "bg-bg-elevated border-border text-text-primary",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({ type, message, duration }: { type: ToastType; message: string; duration?: number }) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, type, message }]);
      // Errors linger twice as long by default — they usually carry a reason
      // the user needs to actually read ("Failed: insufficient buying power").
      // duration 0 = persistent until dismissed.
      const ms = duration ?? (type === "error" ? 10000 : 5000);
      if (ms > 0) {
        setTimeout(() => dismiss(id), ms);
      }
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            className={`animate-slide-up rounded-lg border pl-4 pr-2 py-3 text-sm shadow-lg flex items-start gap-2 ${TOAST_STYLES[t.type]}`}
          >
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded p-1 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
