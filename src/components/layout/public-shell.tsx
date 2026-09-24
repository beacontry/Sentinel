// PublicShell: the site nav and footer around a public content page
// (/learn, /tools, /glossary, /congress, /articles).
//
// Distinct from the app shell because public pages need no app nav, only
// minimal SEO-friendly chrome, cross-links to the public surface, and a
// Get started CTA. The nav and footer are the same components the landing
// page and /pricing use, so the public site has one of each.

import { SiteNav, PUBLIC_NAV_LINKS } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";

interface PublicShellProps {
  children: React.ReactNode;
  /** Which nav link to mark as the current page (e.g., 'learn', 'pricing'). */
  active?: string;
}

export function PublicShell({ children, active }: PublicShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-bg-primary font-[family-name:var(--font-display)] text-text-primary">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteNav links={PUBLIC_NAV_LINKS} active={active} />

      {/* Clears the fixed nav: h-16 plus the safe-area inset. */}
      <div className="h-[calc(4rem+env(safe-area-inset-top))] shrink-0" aria-hidden="true" />

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1180px] flex-1 px-[var(--gutter)] py-8 outline-hidden lg:py-12">
        {children}
      </main>

      <div className="mt-16">
        <SiteFooter />
      </div>
    </div>
  );
}
