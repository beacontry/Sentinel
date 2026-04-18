import type { ImgHTMLAttributes } from "react";

type AvatarSize = "sm" | "md" | "lg";
type StatusType = "online" | "offline";

interface AvatarProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "size"> {
  size?: AvatarSize;
  name?: string;
  status?: StatusType;
  className?: string;
}

const sizeStyles: Record<AvatarSize, { container: string; text: string; dot: string }> = {
  sm: { container: "h-8 w-8", text: "text-xs", dot: "h-2.5 w-2.5" },
  md: { container: "h-10 w-10", text: "text-sm", dot: "h-3 w-3" },
  lg: { container: "h-12 w-12", text: "text-base", dot: "h-3.5 w-3.5" },
};

const statusColors: Record<StatusType, string> = {
  online: "bg-bullish",
  offline: "bg-text-muted",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Avatar({ size = "md", name, status, src, alt, className = "", ...props }: AvatarProps) {
  const s = sizeStyles[size];

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={alt ?? name ?? ""}
          className={`${s.container} rounded-full object-cover border border-border`}
          {...props}
        />
      ) : (
        <div
          className={`${s.container} rounded-full bg-bg-elevated border border-border
            flex items-center justify-center ${s.text} font-medium text-text-secondary`}
        >
          {name ? getInitials(name) : "?"}
        </div>
      )}
      {status && (
        <span
          className={`absolute bottom-0 right-0 ${s.dot} rounded-full
            ${statusColors[status]} ring-2 ring-bg-surface`}
        />
      )}
    </div>
  );
}
