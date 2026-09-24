"use client";

import { useState } from "react";
import { WidgetGrid, type WidgetEntry } from "@/components/dashboard/widget-grid";
import { LayoutSwitcher } from "@/components/dashboard/layout-switcher";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { FreeTierWelcome } from "@/components/tiers/free-tier-welcome";
import {
  Pencil,
  Check,
  Bell,
} from "lucide-react";

export default function DashboardPage() {
  const [editMode, setEditMode] = useState(false);
  const [activeEntries, setActiveEntries] = useState<WidgetEntry[]>([]);
  // Bumped by the layout switcher whenever it changes the default — the grid
  // watches refreshKey via useEffect and re-fetches /api/dashboard/layout.
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-5 p-4 lg:space-y-6 lg:p-6">
      {/* Free-tier first-impression card — auto-hides for paid users and
          for free users who've dismissed it once. */}
      <FreeTierWelcome />

      {/* Title and one line on the left, the layout controls on the right;
          stacked on phones, where the two labelled buttons shrink to icons. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Dashboard</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Your markets, trades and research in one place. Arrange the modules to suit you.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <LayoutSwitcher
            currentEntries={activeEntries}
            onChanged={() => setRefreshKey((k) => k + 1)}
          />
          <Button
            variant={editMode ? "primary" : "secondary"}
            onClick={() => setEditMode((prev) => !prev)}
            aria-pressed={editMode}
            aria-label={editMode ? "Done editing layout" : "Edit layout"}
          >
            {editMode ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Pencil className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {editMode ? "Done" : "Edit Layout"}
            </span>
          </Button>
          <ButtonLink href="/dashboard/alerts" variant="secondary" aria-label="Alerts">
            <Bell className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Alerts</span>
          </ButtonLink>
        </div>
      </div>

      {editMode && (
        <div role="status" className="flex items-center gap-3 rounded-lg border border-accent bg-bg-secondary px-4 py-3 animate-fade-in">
          <Pencil className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <p className="text-sm text-text-secondary">
            <span className="font-medium text-text-primary">Layout mode.</span>{" "}
            Drag a module or use its arrows to move it, the resize button to
            change its width, and the layout menu to save this arrangement.
          </p>
        </div>
      )}

      <WidgetGrid
        editMode={editMode}
        refreshKey={refreshKey}
        onLayoutChange={setActiveEntries}
      />
    </div>
  );
}
