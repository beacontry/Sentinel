"use client";

import { useState, useRef, useEffect, useCallback, type InputHTMLAttributes } from "react";
import { Search, X } from "lucide-react";
import { FIELD_BASE, fieldStateClasses } from "./input";

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value?: string;
  onSearch: (value: string) => void;
  debounceMs?: number;
  className?: string;
}

export function SearchInput({
  value: controlledValue,
  onSearch,
  debounceMs = 300,
  placeholder = "Search...",
  className = "",
  ...props
}: SearchInputProps) {
  const [internalValue, setInternalValue] = useState(controlledValue ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (controlledValue !== undefined) setInternalValue(controlledValue);
  }, [controlledValue]);

  const handleChange = useCallback(
    (val: string) => {
      setInternalValue(val);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onSearch(val), debounceMs);
    },
    [onSearch, debounceMs]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const clear = () => {
    setInternalValue("");
    onSearch("");
  };

  return (
    <div className={`relative ${className}`}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-text-muted" />
      <input
        type="text"
        value={internalValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className={`${FIELD_BASE} min-h-11 pl-10 pr-11 py-2.5 ${fieldStateClasses(false)}`}
        {...props}
      />
      {internalValue && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted
            hover:text-text-primary transition-colors cursor-pointer"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
