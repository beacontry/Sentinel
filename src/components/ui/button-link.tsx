import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button";

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/**
 * A link that looks like a Button. Navigation is a link, never a button
 * inside an anchor: `<Link><Button/></Link>` is invalid HTML, gives two
 * tab stops for one action, and screen readers announce it twice.
 *
 * The classes come from the Button primitive, so the two cannot drift.
 * A link has no disabled state; render a disabled Button instead when
 * the destination is not available.
 */
export function ButtonLink({ variant = "primary", size = "md", className = "", ...props }: ButtonLinkProps) {
  // `enabled:` never matches an anchor, so repeat the variant's hover
  // without it. Only primary lifts, as the button does.
  const hover: Record<ButtonVariant, string> = {
    primary: "hover:bg-accent-hover hover:-translate-y-px active:translate-y-0",
    secondary: "hover:bg-bg-hover",
    outline: "hover:bg-bg-hover",
    ghost: "hover:bg-bg-hover hover:text-text-primary",
    destructive: "hover:bg-[color-mix(in_oklch,var(--color-bearish)_18%,var(--color-bg-surface))]",
    danger: "hover:brightness-110",
  };
  return <Link className={buttonClasses(variant, size, `${hover[variant]} ${className}`)} {...props} />;
}
