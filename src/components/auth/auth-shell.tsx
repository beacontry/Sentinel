import Link from "next/link";
import type { ReactNode } from "react";
import { BeacontryMark } from "@/components/brand/beacontry-mark";

/**
 * The frame for the sign-in and sign-up pages: the brand at the top left
 * where the site nav keeps it, the form in the middle, and the legal
 * links at the foot, because a sign-up is where people look for them.
 *
 * On a phone the form sits straight on the page, full width; a card with
 * a 16px margin inside a 390px screen only narrowed the fields. From sm up
 * it is one card on the page background.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg-primary text-text-primary">
      <header className="mx-auto flex h-16 w-full max-w-[1280px] shrink-0 items-center px-[var(--gutter)] pt-[env(safe-area-inset-top)]">
        <Link href="/" className="-ml-1 flex min-h-11 items-center gap-2.5 rounded-md px-1 text-lg font-bold tracking-[-0.02em]">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-on-accent">
            <BeacontryMark variant="full" className="h-7 w-7" />
          </span>
          Beacontry
        </Link>
      </header>

      <main id="main" className="flex flex-1 items-start justify-center px-[var(--gutter)] pb-10 pt-6 sm:items-center sm:pt-4">
        <div className="w-full max-w-[26rem] sm:rounded-xl sm:border sm:border-border sm:bg-bg-secondary sm:p-8 sm:shadow-pop">
          {children}
        </div>
      </main>

      <footer className="px-[var(--gutter)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <ul className="flex flex-wrap justify-center gap-x-5 text-xs text-text-muted">
          {[
            { label: "Terms", href: "/terms" },
            { label: "Privacy", href: "/privacy" },
            { label: "Risk disclosure", href: "/risk" },
            { label: "Contact", href: "/contact" },
          ].map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="inline-flex min-h-11 items-center hover:text-text-secondary">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </footer>
    </div>
  );
}

/** The page title and its one line of context, the same on every auth view. */
export function AuthHeading({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-text-primary">{title}</h1>
      {children && <p className="mt-1.5 text-sm text-text-secondary">{children}</p>}
    </div>
  );
}

/**
 * A form's error. Always mounted as role="alert" so a screen reader
 * announces the text when it appears; with no error it is an empty,
 * visually hidden region. The text uses the bearish foreground, which is
 * the colour measured against the bearish fill.
 */
export function AuthError({ id, error }: { id: string; error: string }) {
  return (
    <div
      id={id}
      role="alert"
      className={error ? "rounded-lg border border-bearish-line bg-bearish-fill px-3 py-2 text-sm text-bearish-fg" : "sr-only"}
    >
      {error}
    </div>
  );
}

/** The "No account? Create one" line under a form. */
export function AuthSwitch({ prompt, href, label }: { prompt: string; href: string; label: string }) {
  return (
    <p className="mt-6 border-t border-border pt-5 text-sm text-text-secondary">
      {prompt}{" "}
      <Link href={href} className="font-semibold text-accent hover:underline">
        {label}
      </Link>
    </p>
  );
}
