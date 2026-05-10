import { Info } from "lucide-react";

interface EducationalDisclaimerProps {
  /** "compact" = single-line note, "full" = expanded warning block */
  variant?: "compact" | "full";
  className?: string;
}

/**
 * Shared disclaimer for all financial education content.
 *
 * IMPORTANT: This must appear on every guide, calculator, and personal-finance
 * education surface. We are not licensed financial advisors, tax professionals,
 * or insurance agents. Content is general education only.
 */
export function EducationalDisclaimer({
  variant = "full",
  className = "",
}: EducationalDisclaimerProps) {
  if (variant === "compact") {
    return (
      <p
        className={`flex items-start gap-2 text-xs leading-relaxed text-text-muted ${className}`}
      >
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Educational content only. Not financial, tax, or legal advice.
          Consult a licensed professional before acting on anything you read here.
        </span>
      </p>
    );
  }

  return (
    <div
      role="note"
      aria-label="Educational disclaimer"
      data-print-disclaimer
      className={`rounded-xl border border-warning/20 bg-warning/10 p-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        <Info
          className="mt-0.5 h-4 w-4 shrink-0 text-warning"
          aria-hidden="true"
        />
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-text-primary">
            Educational content — not personalized advice
          </p>
          <p className="text-xs leading-relaxed text-text-secondary">
            Sentinel is not a registered investment advisor, tax professional,
            insurance agent, or law firm. Everything below is general education
            about how these products and rules work — not a recommendation
            specific to your situation. Tax laws, contribution limits, and
            insurance products change frequently and vary by state and income.
            Before making any contribution, withdrawal, conversion, rollover,
            policy purchase, or beneficiary change, consult a licensed CFP,
            CPA, attorney, or fiduciary advisor who knows your full picture.
          </p>
        </div>
      </div>
    </div>
  );
}
