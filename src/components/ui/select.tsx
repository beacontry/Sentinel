"use client";

import { useId } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, Check } from "lucide-react";
import { HelpTip } from "./help-tip";
import { describedBy, FIELD_BASE, FieldError, fieldStateClasses } from "./input";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  /**
   * Optional beginner-friendly help text rendered next to the label.
   * Requires a `<TooltipProvider>` ancestor (mounted in dashboard
   * layout). See Input component for the same pattern.
   */
  help?: string;
  /**
   * The accessible name when there is no visible label, such as a year
   * picker in a page header. Ignored when `label` is set.
   */
  "aria-label"?: string;
}

export function Select({
  label,
  error,
  options,
  placeholder = "Select...",
  value,
  onChange,
  disabled,
  className = "",
  id,
  name,
  help,
  "aria-label": ariaLabel,
}: SelectProps) {
  const autoId = useId();
  const selectId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : autoId);
  const errorId = `${selectId}-error`;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <div className="flex items-center gap-1.5">
          <label
            htmlFor={selectId}
            className="block text-xs font-medium text-text-secondary"
          >
            {label}
          </label>
          {help && <HelpTip>{help}</HelpTip>}
        </div>
      )}
      <SelectPrimitive.Root value={value} onValueChange={onChange} disabled={disabled} name={name}>
        <SelectPrimitive.Trigger
          id={selectId}
          aria-label={label ? undefined : ariaLabel}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(error && errorId)}
          className={`${FIELD_BASE} inline-flex min-h-11 items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer
            ${fieldStateClasses(Boolean(error))}`}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon>
            <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className="z-[100] w-[var(--radix-select-trigger-width)] max-h-60 overflow-y-auto
              rounded-lg border border-border bg-bg-surface p-1 shadow-pop animate-scale-in"
          >
            <SelectPrimitive.Viewport>
              {options.map((opt) =>
                opt.value === "_divider" ? (
                  <SelectPrimitive.Separator
                    key="_divider"
                    className="my-1 h-px bg-border"
                  />
                ) : (
                  <SelectPrimitive.Item
                    key={opt.value}
                    value={opt.value}
                    className="flex items-center justify-between rounded-md px-2.5 py-2 text-sm
                      text-text-secondary cursor-pointer outline-none
                      data-[highlighted]:bg-bg-hover data-[highlighted]:text-text-primary
                      data-[state=checked]:text-accent"
                  >
                    <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator>
                      <Check className="h-3.5 w-3.5 text-accent" />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                )
              )}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

Select.displayName = "Select";
