import type { ReactNode } from "react";
import { Ban, Check, Circle, Clock, CircleDashed, RefreshCw, X } from "lucide-react";
import { STATUS_TONE_CLASSES, type StatusTone } from "@/lib/status-tone";
import { orderStatusMeta, type OrderStatusIcon } from "@/lib/order-status";

/**
 * A state, printed. Tone classes come from STATUS_TONE_CLASSES, the one
 * status map (the -fg label on its -fill with a -line edge, measured at
 * 4.5:1 in every theme).
 *
 * Money states never rely on colour alone, so the type makes an icon
 * required for the gain and loss tones: a red and a green chip with the
 * same word shape are one chip to a colour-blind reader. The icon is
 * decorative (aria-hidden); the children carry the words.
 */

type Base = { children?: ReactNode; className?: string };
export type StatusChipProps = Base &
  (
    | { tone: "bullish" | "bearish"; icon: ReactNode }
    | { tone?: Exclude<StatusTone, "bullish" | "bearish">; icon?: ReactNode }
  );

export const STATUS_CHIP_BASE =
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export function StatusChip({ tone = "neutral", icon, children, className = "" }: StatusChipProps) {
  return (
    <span className={`${STATUS_CHIP_BASE} ${STATUS_TONE_CLASSES[tone]} ${className}`}>
      {icon && (
        <span aria-hidden="true" className="inline-flex shrink-0">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}

const ICONS: Record<OrderStatusIcon, ReactNode> = {
  check: <Check className="h-3 w-3" strokeWidth={2.5} />,
  cross: <X className="h-3 w-3" strokeWidth={2.5} />,
  clock: <Clock className="h-3 w-3" />,
  half: <CircleDashed className="h-3 w-3" />,
  ban: <Ban className="h-3 w-3" />,
  replace: <RefreshCw className="h-3 w-3" />,
  dot: <Circle className="h-2 w-2 fill-current" />,
};

/** An order or trade status as a chip: word, icon and tone from one map. */
export function OrderStatusChip({ status, className = "" }: { status: string | null | undefined; className?: string }) {
  const meta = orderStatusMeta(status);
  return (
    <span className={`${STATUS_CHIP_BASE} ${STATUS_TONE_CLASSES[meta.tone]} ${className}`}>
      <span aria-hidden="true" className="inline-flex shrink-0">
        {ICONS[meta.icon]}
      </span>
      {meta.label}
    </span>
  );
}
