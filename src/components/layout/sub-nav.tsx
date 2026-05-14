"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTier } from "@/components/tiers/tier-gate";
import { visibleSubNav, type SubNavTab } from "./nav-config";

interface SubNavProps {
  tabs: SubNavTab[];
}

export function SubNav({ tabs }: SubNavProps) {
  const pathname = usePathname();
  // Filter admin-only tabs (e.g. /dashboard/optimizer used to be
  // adminOnly:true) so non-admins don't see them. The page itself
  // still enforces role server-side; this is purely UX.
  const { role } = useTier();
  const visibleTabs = visibleSubNav(tabs, role);

  if (visibleTabs.length <= 1) return null;

  return (
    <div className="mb-6 flex flex-wrap gap-1 overflow-x-auto">
      {visibleTabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-accent text-white shadow-sm"
                : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
