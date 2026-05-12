"use client";

import { useEffect, useState } from "react";
import {
  Layout as LayoutIcon,
  Check,
  Save,
  Pencil,
  Trash2,
  ChevronDown,
  Plus,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Modal, ModalHeader, ModalTitle, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { WidgetEntry } from "./widget-grid";

interface LayoutMeta {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
}

interface LayoutSwitcherProps {
  /** Current grid contents — used for "Save as new". Snapshot from parent. */
  currentEntries: WidgetEntry[];
  /** Called after any successful mutation so the parent reloads the grid. */
  onChanged: () => void;
}

// Tiny dropdown trigger that doubles as a label for the active layout. Sitting
// next to the Edit Layout button so the switcher is visually grouped with the
// other layout controls. Width is bounded so very long names don't push the
// Edit button off the right side on tablet.
export function LayoutSwitcher({ currentEntries, onChanged }: LayoutSwitcherProps) {
  const toast = useToast();
  const [layouts, setLayouts] = useState<LayoutMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveOpen, setSaveOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState<LayoutMeta | null>(null);
  const [deleteOpen, setDeleteOpen] = useState<LayoutMeta | null>(null);
  const [saveName, setSaveName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function fetchLayouts() {
    try {
      const res = await fetch("/api/dashboard/layouts");
      if (!res.ok) {
        if (res.status !== 401) toast.toast({ type: "error", message: "Could not load saved layouts." });
        setLayouts([]);
        return;
      }
      const data = await res.json();
      setLayouts(data.layouts ?? []);
    } catch {
      setLayouts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLayouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = layouts.find((l) => l.isDefault) ?? null;

  async function switchTo(layout: LayoutMeta) {
    if (layout.isDefault) return;
    try {
      const res = await fetch(`/api/dashboard/layouts/${layout.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setDefault: true }),
      });
      if (!res.ok) {
        toast.toast({ type: "error", message: "Could not switch layout." });
        return;
      }
      toast.toast({ type: "success", message: `Switched to "${layout.name}".` });
      await fetchLayouts();
      onChanged();
    } catch {
      toast.toast({ type: "error", message: "Could not switch layout." });
    }
  }

  async function saveAsNew() {
    if (!saveName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/dashboard/layouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName.trim(),
          widgets: currentEntries,
          setDefault: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.toast({
          type: "error",
          message: typeof data.error === "string" ? data.error : "Could not save layout.",
        });
        return;
      }
      toast.toast({ type: "success", message: `Layout "${saveName.trim()}" saved.` });
      setSaveOpen(false);
      setSaveName("");
      await fetchLayouts();
      onChanged();
    } catch {
      toast.toast({ type: "error", message: "Could not save layout." });
    } finally {
      setSubmitting(false);
    }
  }

  async function renameLayout() {
    if (!renameOpen || !renameName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/dashboard/layouts/${renameOpen.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameName.trim() }),
      });
      if (!res.ok) {
        toast.toast({ type: "error", message: "Could not rename layout." });
        return;
      }
      toast.toast({ type: "success", message: `Renamed to "${renameName.trim()}".` });
      setRenameOpen(null);
      setRenameName("");
      await fetchLayouts();
    } catch {
      toast.toast({ type: "error", message: "Could not rename layout." });
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteLayout() {
    if (!deleteOpen) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/dashboard/layouts/${deleteOpen.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.toast({ type: "error", message: "Could not delete layout." });
        return;
      }
      toast.toast({ type: "success", message: `Deleted "${deleteOpen.name}".` });
      const wasDefault = deleteOpen.isDefault;
      setDeleteOpen(null);
      await fetchLayouts();
      // Refresh the grid only if we removed the active layout — otherwise the
      // current display is still correct and bumping the key adds latency.
      if (wasDefault) onChanged();
    } catch {
      toast.toast({ type: "error", message: "Could not delete layout." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm
              text-text-primary hover:border-border-hover hover:bg-bg-hover transition-colors min-h-[40px]
              max-w-[260px]"
            aria-label="Switch dashboard layout"
            title={active ? `Active layout: ${active.name}` : "Choose a layout"}
          >
            <LayoutIcon className="h-4 w-4 text-text-muted shrink-0" />
            <span className="truncate">
              {loading ? "Loading…" : active?.name ?? "Default"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-text-muted shrink-0" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-[260px] max-w-[320px] rounded-lg border border-border bg-bg-elevated p-1
              animate-scale-in shadow-lg"
          >
            {layouts.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                  Saved layouts
                </div>
                {layouts.map((l) => (
                  <DropdownMenu.Item
                    key={l.id}
                    onSelect={() => switchTo(l)}
                    className="group flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm
                      text-text-secondary hover:bg-bg-hover hover:text-text-primary
                      focus:bg-bg-hover focus:text-text-primary cursor-pointer outline-none"
                  >
                    <span className="flex items-center gap-2 min-w-0 flex-1">
                      <Check
                        className={`h-3.5 w-3.5 shrink-0 ${
                          l.isDefault ? "text-accent" : "text-transparent"
                        }`}
                      />
                      <span className="truncate">{l.name}</span>
                    </span>
                    <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setRenameName(l.name);
                          setRenameOpen(l);
                        }}
                        className="p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-text-primary"
                        aria-label={`Rename ${l.name}`}
                        title="Rename"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setDeleteOpen(l);
                        }}
                        className="p-1 rounded hover:bg-bearish/10 text-text-muted hover:text-bearish"
                        aria-label={`Delete ${l.name}`}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  </DropdownMenu.Item>
                ))}
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
              </>
            )}
            <DropdownMenu.Item
              onSelect={() => {
                setSaveName("");
                setSaveOpen(true);
              }}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm
                text-accent hover:bg-accent/10 focus:bg-accent/10 cursor-pointer outline-none"
            >
              <Plus className="h-3.5 w-3.5" />
              Save current as new…
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* Save as new modal */}
      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} className="max-w-md">
        <ModalHeader>
          <ModalTitle>Save layout</ModalTitle>
        </ModalHeader>
        <div className="px-5 pb-2 space-y-3">
          <p className="text-sm text-text-secondary">
            Save the current widgets and sizes as a named layout. You can switch
            back to it later from this menu.
          </p>
          <Input
            label="Layout name"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="e.g. Morning Review"
            maxLength={60}
            autoFocus
          />
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setSaveOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={saveAsNew}
            loading={submitting}
            disabled={!saveName.trim()}
          >
            <Save className="h-4 w-4" /> Save layout
          </Button>
        </ModalFooter>
      </Modal>

      {/* Rename modal */}
      <Modal open={renameOpen !== null} onClose={() => setRenameOpen(null)} className="max-w-md">
        <ModalHeader>
          <ModalTitle>Rename layout</ModalTitle>
        </ModalHeader>
        <div className="px-5 pb-2 space-y-3">
          <Input
            label="New name"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            maxLength={60}
            autoFocus
          />
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setRenameOpen(null)}>
            Cancel
          </Button>
          <Button
            onClick={renameLayout}
            loading={submitting}
            disabled={!renameName.trim() || renameName.trim() === renameOpen?.name}
          >
            Rename
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete confirmation */}
      <Modal open={deleteOpen !== null} onClose={() => setDeleteOpen(null)} className="max-w-md">
        <ModalHeader>
          <ModalTitle>Delete layout?</ModalTitle>
        </ModalHeader>
        <div className="px-5 pb-2">
          <p className="text-sm text-text-secondary">
            Delete <span className="font-semibold text-text-primary">{deleteOpen?.name}</span>?
            {deleteOpen?.isDefault &&
              " The next-oldest layout will become the new default."}
          </p>
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDeleteOpen(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={deleteLayout}
            loading={submitting}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
