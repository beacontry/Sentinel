"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { useState, type ReactNode } from "react";

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * An underline tab bar. Radix gives the tablist semantics and the arrow
 * keys; the active tab is marked by aria-selected (data-state), and the
 * focus ring is the global one. The bar scrolls sideways on a phone
 * rather than wrapping.
 */
export function Tabs({ tabs, activeTab, onChange, className = "" }: TabsProps) {
  return (
    <TabsPrimitive.Root value={activeTab} onValueChange={onChange}>
      <TabsPrimitive.List
        className={`flex items-center gap-1 overflow-x-auto border-b border-border ${className}`}
      >
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.id}
            value={tab.id}
            className="relative inline-flex min-h-11 items-center px-3 text-sm font-medium transition-colors duration-150
              whitespace-nowrap cursor-pointer -outline-offset-2
              data-[state=active]:text-accent
              data-[state=inactive]:text-text-muted data-[state=inactive]:hover:text-text-secondary
              after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full
              after:transition-colors after:duration-150
              data-[state=active]:after:bg-accent
              data-[state=inactive]:after:bg-transparent"
          >
            {tab.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  );
}

interface TabPanelProps {
  active: boolean;
  children?: ReactNode;
  className?: string;
}

/**
 * A tab's content. It mounts the first time its tab is shown and is then
 * hidden, not unmounted, when another tab is chosen, so a half-typed
 * calculator input or a scroll position survives a switch. A panel that
 * has never been shown is not mounted, so its effects do not run early.
 */
export function TabPanel({ active, children, className = "" }: TabPanelProps) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  if (!visited) return null;
  return (
    <div role="tabpanel" hidden={!active} className={`animate-fade-in ${className}`}>
      {children}
    </div>
  );
}
