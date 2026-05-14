"use client";

import { HelpCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip } from "./tooltip";

interface HelpTipProps {
  /** Short explanation. Keep to ~1-2 lines for readability in the tooltip popover. */
  children: string;
  /** Optional: render at a specific side. Default top. */
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

/**
 * Tiny info-circle that opens a tooltip on hover/focus. Use next to a
 * form-field label to give beginners a one-line explanation of a
 * trading concept (e.g. "Stop Loss %", "Trailing Stop %", "Time-in-Force")
 * without cluttering the form with inline help text.
 *
 * Always inside a `<TooltipProvider>` — the dashboard layout already
 * wraps the whole app, so this works on any dashboard page.
 */
export function HelpTip({ children, side = "top", className = "" }: HelpTipProps) {
  return (
    <Tooltip content={children} side={side}>
      <button
        type="button"
        aria-label="Help"
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent ${className}`}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}

interface FieldLabelProps {
  htmlFor?: string;
  children: ReactNode;
  /** When set, renders a HelpTip after the label text. */
  help?: string;
  /** Extra trailing content (e.g. a unit indicator like "USD"). */
  hint?: ReactNode;
  className?: string;
}

/**
 * `<label>` + optional help-tip + optional trailing hint. Pairs with
 * the standard <Input>/<Select>/<Textarea> components, which all accept
 * an explicit `id` you can wire to `htmlFor`.
 *
 * Example:
 *   <FieldLabel htmlFor="stopLoss" help="Stops you out when the trade loses X%. 8-12% is typical for swing trades.">
 *     Stop Loss %
 *   </FieldLabel>
 *   <Input id="stopLoss" type="number" ... />
 */
export function FieldLabel({
  htmlFor,
  children,
  help,
  hint,
  className = "",
}: FieldLabelProps) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-text-secondary"
      >
        {children}
      </label>
      {help && <HelpTip>{help}</HelpTip>}
      {hint && (
        <span className="ml-auto text-[10px] uppercase tracking-wide text-text-muted">
          {hint}
        </span>
      )}
    </div>
  );
}
