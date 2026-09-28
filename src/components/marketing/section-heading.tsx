import type { ReactNode } from "react";

/**
 * One header anatomy for every landing section: the title and one line
 * of what the section holds on the left, that section's own control on
 * the right. Left-aligned; the old centred stacks each carried a
 * "// kicker" in monospace, which named nothing the heading did not.
 */
export function SectionHeading({
  id,
  title,
  lede,
  action,
}: {
  id: string;
  title: ReactNode;
  lede?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 max-w-[44rem]">
        <h2 id={id} className="text-xl font-bold tracking-[-0.02em] text-balance text-text-primary lg:text-2xl lg:tracking-[-0.03em]">
          {title}
        </h2>
        {lede && <p className="mt-3 text-base text-text-secondary">{lede}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Vertical rhythm and the gutter for a landing band. */
export const BAND = "mx-auto max-w-[1280px] px-[var(--gutter)] py-16 lg:py-24";
