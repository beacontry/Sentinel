"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SubNavTab } from "./nav-config";

interface SubNavProps {
  tabs: SubNavTab[];
}

export function SubNav({ tabs }: SubNavProps) {
  const pathname = usePathname();

  if (tabs.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border mb-6">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative shrink-0 px-3 py-2.5 text-sm font-medium transition-colors duration-150 whitespace-nowrap ${
              active
                ? "text-accent"
                : "text-text-muted hover:text-text-secondary"
            } after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors after:duration-150 ${
              active ? "after:bg-accent" : "after:bg-transparent"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
