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
    <div className="mb-6 flex flex-wrap gap-1 overflow-x-auto">
      {tabs.map((tab) => {
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
