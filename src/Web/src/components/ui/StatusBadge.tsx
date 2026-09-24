import { AlertTriangle, CheckCircle2, CircleHelp, MinusCircle, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { STATUS_LABEL, TONE_BADGE, toneForStatus, type DisplayStatus } from "@/lib/tones";

const STATUS_ICON: Record<DisplayStatus, LucideIcon> = {
  operational: CheckCircle2,
  degraded: AlertTriangle,
  outage: XCircle,
  notConfigured: MinusCircle,
  unavailable: CircleHelp
};

interface StatusBadgeProps {
  status: DisplayStatus;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

export function StatusBadge({ status, label, size = "md", className }: StatusBadgeProps) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-[0.8125rem]",
        TONE_BADGE[toneForStatus(status)],
        className
      )}
    >
      <Icon aria-hidden="true" className={size === "sm" ? "size-3.5" : "size-4"} />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
