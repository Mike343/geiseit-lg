import { AlertTriangle, CheckCircle2, CircleHelp, MinusCircle, XCircle, type LucideIcon } from "lucide-react";
import type { DisplayStatus } from "@/lib/tones";

const ICONS: Record<DisplayStatus, LucideIcon> = {
  operational: CheckCircle2,
  degraded: AlertTriangle,
  outage: XCircle,
  notConfigured: MinusCircle,
  unavailable: CircleHelp
};

export function StatusIcon({ status, className }: { status: DisplayStatus; className?: string }) {
  const Icon = ICONS[status];
  return <Icon aria-hidden="true" className={className} />;
}
