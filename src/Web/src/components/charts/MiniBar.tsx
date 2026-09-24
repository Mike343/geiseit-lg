import { cn } from "@/lib/cn";

interface MiniBarProps {
  value: number | null;
  max: number;
  label: string;
  tone?: "brand" | "danger" | "warning";
  className?: string;
}

const FILL = { brand: "text-series-1", danger: "text-danger-solid", warning: "text-warning-solid" };

export function MiniBar({ value, max, label, tone = "brand", className }: MiniBarProps) {
  const pct = value === null || max <= 0 ? 0 : Math.max(2, Math.min(100, (value / max) * 100));
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 100 8"
      preserveAspectRatio="none"
      className={cn("h-2 w-full min-w-16", className)}
    >
      <rect width="100" height="8" rx="4" className="fill-line" />
      {value !== null && <rect width={pct} height="8" rx="4" className={cn("fill-current", FILL[tone])} />}
    </svg>
  );
}
