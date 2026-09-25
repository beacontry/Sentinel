interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
  rounded?: "sm" | "md" | "lg" | "full";
}

const roundedStyles = {
  sm: "rounded",
  md: "rounded-md",
  lg: "rounded-lg",
  full: "rounded-full",
};

/**
 * A placeholder block. Size it like the thing it stands in for (a table
 * row at the real row height, a stat tile at the tile's size), so the
 * page does not jump when the data lands.
 *
 * The sheen is a token, a 6% mix of the text colour, so it shows on every
 * theme. It was a literal black at 4% alpha, which is invisible on the
 * dark themes. aria-hidden: the loading state is announced once by the
 * surrounding LoadingRegion, not by every block.
 */
export function Skeleton({
  className = "",
  width,
  height,
  rounded = "md",
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`bg-bg-elevated ${roundedStyles[rounded]} ${className}`}
      style={{
        width,
        height,
        backgroundImage:
          "linear-gradient(90deg, transparent 0%, var(--color-skeleton-sheen) 50%, transparent 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s ease-in-out infinite",
      }}
    />
  );
}
