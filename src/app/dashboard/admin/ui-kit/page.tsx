"use client";

// The primitive gallery (redesign plan, Stage 2 verification): every
// primitive in every state on one page, for screenshots in each theme and
// for a keyboard pass. Static sample data only; nothing here reads or
// writes an account. Admin-only, like the rest of /dashboard/admin, and
// not linked from the nav. The gallery itself is UiKitGallery, which the
// capture script also renders without the app (scripts/capture-redesign.mjs).

import { useTier } from "@/components/tiers/tier-gate";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { UiKitGallery } from "@/components/ui-kit/ui-kit-gallery";

export default function UiKitPage() {
  const { role, loading } = useTier();

  if (loading) return <div className="p-4 lg:p-6"><Skeleton height="200px" /></div>;
  if (role !== "admin") {
    return (
      <div className="p-4 lg:p-6">
        <EmptyState title="Admins only" description="The primitive gallery is an admin tool." />
      </div>
    );
  }
  return <UiKitGallery />;
}
