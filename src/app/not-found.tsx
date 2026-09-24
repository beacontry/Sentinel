import { PublicShell } from "@/components/layout/public-shell";
import { ButtonLink } from "@/components/ui/button-link";

/**
 * The 404 for every unmatched URL. It sits on the public site's nav and
 * footer like the other public pages, so a mistyped link still leaves
 * the reader one click from anywhere on the site.
 */
export default function NotFound() {
  return (
    <PublicShell>
      <div className="mx-auto flex max-w-xl flex-col items-start py-8 sm:py-16">
        <p className="font-mono text-display font-semibold text-accent">404</p>
        <h1 className="mt-4 text-xl font-semibold text-text-primary">Page not found</h1>
        <p className="mt-2 text-base text-text-secondary">
          The page you are looking for does not exist, or it has moved.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/">Back to home</ButtonLink>
          <ButtonLink href="/dashboard" variant="secondary">
            Open the dashboard
          </ButtonLink>
        </div>
      </div>
    </PublicShell>
  );
}
