"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ReactNode } from "react";

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
            className="relative px-3 py-2.5 text-sm font-medium transition-colors duration-150
              whitespace-nowrap cursor-pointer outline-none
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
  children: ReactNode;
  className?: string;
}

export function TabPanel({ active, children, className = "" }: TabPanelProps) {
  if (!active) return null;
  return <div className={`animate-fade-in ${className}`}>{children}</div>;
}
