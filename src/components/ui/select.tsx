"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, Check } from "lucide-react";

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
}: SelectProps) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-medium text-text-secondary"
        >
          {label}
        </label>
      )}
      <SelectPrimitive.Root value={value} onValueChange={onChange} disabled={disabled} name={name}>
        <SelectPrimitive.Trigger
          id={selectId}
          className={`inline-flex min-h-[44px] w-full items-center justify-between rounded-lg border bg-bg-elevated px-3 py-2.5
            text-sm text-text-primary transition-colors duration-150 cursor-pointer
            focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
            disabled:pointer-events-none disabled:opacity-50
            ${error ? "border-bearish focus:border-bearish focus:ring-bearish/30" : "border-border"}`}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon>
            <ChevronDown className="h-4 w-4 text-text-muted" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className="z-[100] w-[var(--radix-select-trigger-width)] max-h-60 overflow-y-auto
              rounded-lg border border-border bg-bg-surface p-1 shadow-xl animate-scale-in"
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
      {error && <p className="text-xs text-bearish">{error}</p>}
    </div>
  );
}

Select.displayName = "Select";
