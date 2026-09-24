"use client";

import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WidgetDefinition, WidgetSize } from "@/lib/widget-registry";
import { WidgetWrapper } from "./widget-wrapper";

/**
 * One dashboard widget in the sortable grid: the drag handle, size cycler
 * and move buttons around a WidgetWrapper. Split out of widget-grid.tsx,
 * which keeps the layout state and persistence.
 *
 * Drag is the main interaction in edit mode; the chevrons are the
 * keyboard and touch fallback. Every control is a labelled 36px button
 * over a 44px hit area (they were 28px).
 */

export const SIZE_LABELS: Record<WidgetSize, string> = {
  sm: "Small",
  md: "Medium",
  lg: "Large",
  full: "Full width",
};

interface SortableWidgetProps {
  id: string;
  def: WidgetDefinition;
  size: WidgetSize;
  index: number;
  total: number;
  editMode: boolean;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onCycleSize: () => void;
  children: ReactNode;
}

export function SortableWidget({
  id,
  def,
  size,
  index,
  total,
  editMode,
  onRemove,
  onMoveUp,
  onMoveDown,
  onCycleSize,
  children,
}: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !editMode,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  // Effective size to grid span. The grid is 1 column on phones, 2 from
  // md, 3 from xl and 4 from 2xl (widget-grid.tsx).
  const colSpan =
    size === "full"
      ? "col-span-full"
      : size === "lg"
        ? "md:col-span-2 xl:col-span-3"
        : size === "md"
          ? "md:col-span-2"
          : "";

  return (
    <div ref={setNodeRef} style={style} className={`min-w-0 ${colSpan}`}>
      <WidgetWrapper
        title={def.name}
        description={def.description}
        link={def.link}
        editMode={editMode}
        index={index}
        onRemove={onRemove}
        headerAction={
          editMode ? (
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                {...attributes}
                {...listeners}
                className="w-9 cursor-grab touch-none px-0 active:cursor-grabbing"
                aria-label={`Drag to reorder ${def.name}`}
                title="Drag to reorder"
              >
                <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onCycleSize}
                className="w-9 px-0"
                aria-label={`Resize ${def.name} (currently ${SIZE_LABELS[size]})`}
                title={`Resize — ${SIZE_LABELS[size]}`}
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onMoveUp}
                disabled={index === 0}
                className="w-9 px-0"
                aria-label={`Move ${def.name} up`}
              >
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onMoveDown}
                disabled={index === total - 1}
                className="w-9 px-0"
                aria-label={`Move ${def.name} down`}
              >
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          ) : undefined
        }
      >
        {children}
      </WidgetWrapper>
    </div>
  );
}
