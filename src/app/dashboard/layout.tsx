"use client";

import { AppShell } from "@/components/layout/app-shell";
import { AiProvider } from "@/components/ai/ai-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandPalette } from "@/components/ui/command-palette";
import { CsrfInit } from "@/components/csrf-init";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider>
      <AiProvider>
        <AppShell>{children}</AppShell>
        <CommandPalette />
        <CsrfInit />
      </AiProvider>
    </TooltipProvider>
  );
}
