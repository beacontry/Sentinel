import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * A condition on the desk that needs the trader now: the engine offline
 * with positions open, a position without a broker stop. One shape for
 * all of them: an icon and a bold title in the state foreground, a line
 * of explanation, and at most one action on the right (below on phones).
 * role="alert", so it is announced once when it appears.
 */

const TONES = {
  warning: { box: "border-warning-line bg-warning-fill", fg: "text-warning-fg" },
  bearish: { box: "border-bearish-line bg-bearish-fill", fg: "text-bearish-fg" },
} as const;

interface DeskAlertProps {
  tone: keyof typeof TONES;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}

export function DeskAlert({ tone, title, children, action }: DeskAlertProps) {
  const t = TONES[tone];
  return (
    <div
      role="alert"
      className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${t.box}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${t.fg}`} />
        <div className="min-w-0 text-sm">
          <p className={`font-semibold ${t.fg}`}>{title}</p>
          {children && <div className="mt-0.5 text-text-secondary">{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0 sm:ml-4">{action}</div>}
    </div>
  );
}
