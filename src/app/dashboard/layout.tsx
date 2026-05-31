"use client";

// Top-nav trial. To revert: swap back to `import { AppShell } from "@/components/layout/app-shell"`
// and rename the `<AppShell>` JSX below. AppShell is left fully intact.
import { TopNavShell as AppShell } from "@/components/layout/top-nav-shell";
import { AiProvider } from "@/components/ai/ai-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { CommandPalette } from "@/components/ui/command-palette";
import { CsrfInit } from "@/components/csrf-init";
import { SessionGuard } from "@/components/session-guard";
import { PinSetupBanner } from "@/components/pin-setup-banner";
import { BillingStatusBanner } from "@/components/layout/billing-status-banner";
import { SafeguardsOnboardingModal } from "@/components/safeguards-onboarding-modal";
import { DisplayPrefsProvider } from "@/components/display-prefs-provider";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { TermsAcceptanceModal } from "@/components/terms-acceptance-modal";

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
              <BillingStatusBanner />
              <PinSetupBanner />
              {children}
            </AppShell>
            <CommandPalette />
            <KeyboardShortcuts />
            <CsrfInit />
            <SessionGuard />
            <SafeguardsOnboardingModal />
            <TermsAcceptanceModal />
          </AiProvider>
        </DisplayPrefsProvider>
      </ToastProvider>
    </TooltipProvider>
  );
}
