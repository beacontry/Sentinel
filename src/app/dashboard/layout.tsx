"use client";

import { AppShell } from "@/components/layout/app-shell";
import { AiProvider } from "@/components/ai/ai-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { CommandPalette } from "@/components/ui/command-palette";
import { CsrfInit } from "@/components/csrf-init";
import { SessionGuard } from "@/components/session-guard";
import { PinSetupBanner } from "@/components/pin-setup-banner";
import { SafeguardsOnboardingModal } from "@/components/safeguards-onboarding-modal";
import { DisplayPrefsProvider } from "@/components/display-prefs-provider";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider>
      <ToastProvider>
        <DisplayPrefsProvider>
          <AiProvider>
            <AppShell>
              <PinSetupBanner />
              {children}
            </AppShell>
            <CommandPalette />
            <KeyboardShortcuts />
            <CsrfInit />
            <SessionGuard />
            <SafeguardsOnboardingModal />
          </AiProvider>
        </DisplayPrefsProvider>
      </ToastProvider>
    </TooltipProvider>
  );
}
