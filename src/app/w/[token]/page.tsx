// Public read-only watchlist page. Anyone with the share token URL
// (/w/[token]) can view, no Sentinel account required. Renders symbols
// + owner attribution. Each symbol links to the Sentinel marketing
// page or analysis page (if the viewer has a session — but we don't
// check here; the link target page handles auth).

import { notFound } from "next/navigation";
import Link from "next/link";
import { Radar } from "lucide-react";

interface SharedWatchlist {
  name: string;
  ownerName: string;
  createdAt: string;
  symbols: string[];
}

async function fetchShared(token: string): Promise<SharedWatchlist | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.NODE_ENV === "production"
      ? "https://sentinel.guardcybersolutionsllc.com"
      : "http://localhost:3010");
  try {
    const res = await fetch(`${baseUrl}/api/public/watchlist/${encodeURIComponent(token)}`, {
      // Same cache TTL as the underlying API
      next: { revalidate: 120 },
    });
    if (!res.ok) return null;
    return (await res.json()) as SharedWatchlist;
  } catch {
    return null;
  }
}

export default async function PublicWatchlistPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await fetchShared(token);

  if (!data) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="border-b border-border bg-bg-secondary">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5 text-text-primary hover:text-accent transition-colors">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
              <Radar className="h-4 w-4" />
            </div>
            <span className="font-semibold">Sentinel</span>
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div>
          <p className="text-xs text-text-muted uppercase tracking-[0.1em]">Shared watchlist</p>
          <h1 className="text-2xl font-semibold text-text-primary mt-1">{data.name}</h1>
          <p className="text-sm text-text-secondary mt-1">
            Shared by <span className="font-medium text-text-primary">{data.ownerName}</span> ·{" "}
            <span className="font-mono">{data.symbols.length}</span> symbol
            {data.symbols.length !== 1 ? "s" : ""}
          </p>
        </div>

        {data.symbols.length === 0 ? (
          <div className="rounded-xl border border-border bg-bg-surface p-8 text-center">
            <p className="text-sm text-text-muted">No symbols in this list yet.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-bg-surface p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {data.symbols.map((sym) => (
                <Link
                  key={sym}
                  href={`/dashboard/analysis?symbol=${encodeURIComponent(sym)}`}
                  className="rounded-lg bg-bg-elevated px-3 py-2 text-center font-mono text-sm font-semibold text-text-primary hover:text-accent hover:bg-bg-hover transition-colors"
                >
                  {sym}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border bg-bg-surface p-5 text-sm text-text-secondary">
          <p className="font-medium text-text-primary mb-2">Build your own watchlist with Sentinel</p>
          <p>
            Track symbols, get signal alerts, and run AI-driven analysis.{" "}
            <Link href="/" className="text-accent hover:text-accent-hover underline">
              Learn more
            </Link>{" "}
            or{" "}
            <Link href="/login" className="text-accent hover:text-accent-hover underline">
              sign in
            </Link>
            .
          </p>
        </div>

        <p className="text-center text-[11px] text-text-muted">
          This watchlist is shared publicly via a unique link. The owner can revoke access at any time.
        </p>
      </main>
    </div>
  );
}
