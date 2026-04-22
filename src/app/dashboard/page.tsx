"use client";

import { useState } from "react";
import { WidgetGrid } from "@/components/dashboard/widget-grid";
import { Button } from "@/components/ui/button";
import { DEFAULT_LAYOUT } from "@/lib/widget-registry";
import {
  Pencil,
  Check,
  Bell,
} from "lucide-react";

export default function DashboardPage() {
  const [editMode, setEditMode] = useState(false);
  const [activeWidgetIds, setActiveWidgetIds] = useState<string[]>(DEFAULT_LAYOUT);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header — S6 style: bold title, subtitle, actions on right */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-text-secondary mt-1">
            Live market context, execution tools, and the modules you use.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={editMode ? "primary" : "outline"}
            size="md"
            onClick={() => setEditMode((prev) => !prev)}
          >
            {editMode ? (
              <Check className="h-4 w-4" />
            ) : (
              <Pencil className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {editMode ? "Done" : "Edit Layout"}
            </span>
          </Button>
          <Button variant="secondary" size="md">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Alerts</span>
          </Button>
        </div>
      </div>

      {editMode && (
        <div className="flex items-center gap-3 rounded-lg border border-accent/20 bg-accent/10 px-4 py-3 animate-fade-in">
          <Pencil className="h-4 w-4 shrink-0 text-accent" />
          <p className="text-sm text-text-secondary">
            <span className="font-medium text-accent">Layout mode</span>{" "}
            &mdash; add, remove, and reorder modules.
          </p>
        </div>
      )}

      <WidgetGrid editMode={editMode} onLayoutChange={setActiveWidgetIds} />
    </div>
  );
}
