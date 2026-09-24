"use client";

import { Receipt } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { TAX_YEAR_OPTIONS } from "./tax-format";

/**
 * A tax year with nothing closed in it: a genuine empty, not a failure
 * (ErrorState) and not a missing connection. It says which year, what
 * was searched, and puts the year switcher right there, because the next
 * question is almost always "what about last year?".
 */
export function NoLotsForYear({
  year,
  onYearChange,
  headingLevel = 2,
}: {
  year: string;
  onYearChange: (year: string) => void;
  headingLevel?: 2 | 3;
}) {
  return (
    <EmptyState
      icon={<Receipt className="h-7 w-7" />}
      headingLevel={headingLevel}
      title={`No matched lots for ${year}`}
      description={`No buy and sell pair closed in ${year}. Trades from your portfolios and from the engine are both included.`}
    >
      <Segmented
        label="Tax year"
        options={TAX_YEAR_OPTIONS}
        value={year}
        onChange={onYearChange}
      />
    </EmptyState>
  );
}
