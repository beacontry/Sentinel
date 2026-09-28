"use client";

import { type ButtonHTMLAttributes, forwardRef, useId } from "react";

/**
 * The one action button.
 *
 * The base owns layout, height, radius, weight and the disabled and busy
 * states; a variant sets only colour and edge. Focus is the global
 * `:focus-visible` outline in globals.css, so every button, link and field
 * draws the same 2px ring and nothing here removes it.
 *
 * - `primary`: the one main action in a view.
 * - `secondary`: every other action. `outline` is its old name.
 * - `ghost`: toolbar and inline actions with no edge.
 * - `destructive`: removes or cancels something the user can redo.
 * - `danger`: the solid fill, only for the one irreversible confirm
 *   (a LIVE order, a book-wide liquidation). Never a default.
 *
 * No default `type`: a Button inside a form submits it, as a plain HTML
 * button does, so existing forms keep their Enter-to-submit.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "danger" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `outline` is deprecated: it renders as `secondary`. */
  variant?: ButtonVariant;
  /**
   * `md` (the default) is 44px tall. `sm` is 36px drawn over a 44px hit
   * area, for dense rows only. `lg` is deprecated: it renders as `md`.
   */
  size?: ButtonSize;
  /** Busy: the button is disabled, marked `aria-busy`, and keeps its label. */
  loading?: boolean;
  /**
   * Why the button cannot be used right now ("Engine is running, stop it
   * first"). When set and the button is disabled, the reason is printed
   * under it and joined to it with `aria-describedby`, so a disabled
   * action never leaves the user guessing. Ignored while enabled or busy.
   */
  disabledReason?: string;
}

/** Shared with ButtonLink, so a link styled as a button cannot drift. */
export const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap cursor-pointer " +
  "transition-[background-color,border-color,color,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] " +
  "disabled:cursor-not-allowed disabled:opacity-55 aria-busy:cursor-progress";

export const BUTTON_SIZES: Record<ButtonSize, string> = {
  md: "min-h-11 px-4 text-sm",
  // 36px visual; the pseudo-element pads the hit area to 44 by 44.
  // Height: it is placed from the padding box, so on a bordered variant
  // (secondary, destructive) a 4px inset reached only 42px; 6px gives 46
  // bordered and 48 borderless.
  // Width: the button's own width, but never under 44px, centred. A text
  // button is wider than 44, so its hit area gets no sideways overhang at
  // all; an icon-only one (w-9, or px-3 round a 16px icon) overhangs by
  // 2-4px a side, only as much as it lacks. A fixed sideways inset on
  // every sm button is what let the later button's pseudo paint over its
  // neighbour's visible edge and take that click (Edit opening Delete),
  // so rows of icon-only buttons keep a gap of 8px (gap-2) or more: two
  // 4px overhangs meet in it without either reaching the other button.
  // It needs a positioning context, which buttonClasses adds as `relative`
  // only when the caller has not positioned the button itself: `relative`
  // is emitted after `absolute` in the built CSS, so adding both would
  // silently pull an absolutely placed button back into flow.
  sm:
    "min-h-9 px-3 text-sm before:absolute before:-inset-y-1.5 before:left-1/2 before:w-full before:min-w-11 " +
    "before:-translate-x-1/2 before:content-['']",
  lg: "min-h-11 px-4 text-sm",
};

// Hover and press only on an enabled button (`enabled:`), so a disabled
// one does not light up under the pointer. Each variant's hover names
// its own background, so no later class can silently cancel it.
export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-on-accent enabled:hover:bg-accent-hover enabled:hover:-translate-y-px enabled:active:translate-y-0",
  secondary:
    "border border-border-control bg-bg-surface text-text-primary enabled:hover:bg-bg-hover",
  ghost:
    "text-text-secondary enabled:hover:bg-bg-hover enabled:hover:text-text-primary",
  destructive:
    "border border-bearish-line bg-bearish-fill text-bearish-fg enabled:hover:bg-[color-mix(in_oklch,var(--color-bearish)_18%,var(--color-bg-surface))]",
  danger:
    "bg-bearish-solid text-on-bearish enabled:hover:brightness-110",
  outline:
    "border border-border-control bg-bg-surface text-text-primary enabled:hover:bg-bg-hover",
};

// Unprefixed only: `sm:absolute` leaves the phone layout unpositioned,
// so the button still needs its own `relative` there.
const POSITIONED = /(^|\s)(?:absolute|fixed|sticky|relative)(?=\s|$)/;

/** The class string for a button, for elements that cannot be a Button. */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className = ""): string {
  const position = size === "sm" && !POSITIONED.test(className) ? "relative" : "";
  return `${BUTTON_BASE} ${BUTTON_SIZES[size]} ${position} ${BUTTON_VARIANTS[variant]} ${className}`
    .replace(/\s+/g, " ")
    .trim();
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`shrink-0 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      disabledReason,
      className = "",
      children,
      "aria-describedby": describedBy,
      ...props
    },
    ref
  ) => {
    const reasonId = useId();
    const isDisabled = Boolean(disabled || loading);
    const showReason = Boolean(disabledReason) && isDisabled && !loading;
    const describedByIds =
      [describedBy, showReason ? reasonId : undefined].filter(Boolean).join(" ") || undefined;

    const button = (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        aria-describedby={describedByIds}
        className={buttonClasses(variant, size, className)}
        {...props}
      >
        {loading && <Spinner />}
        {children}
      </button>
    );

    if (!showReason) return button;
    return (
      <span className="inline-flex flex-col items-start gap-1.5">
        {button}
        <span id={reasonId} className="text-xs text-text-secondary">
          {disabledReason}
        </span>
      </span>
    );
  }
);

Button.displayName = "Button";
