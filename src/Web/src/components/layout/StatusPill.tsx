"use client";

import { useServiceStatus } from "@/hooks/useServiceStatus";
import { cn } from "@/lib/cn";
import { STATUS_LABEL, TONE_BADGE, TONE_DOT, toneForStatus, type DisplayStatus } from "@/lib/tones";

export function overallToDisplay(status: string | undefined): DisplayStatus {
  return status === "operational" || status === "degraded" || status === "outage" ? status : "unavailable";
}

export function StatusPill() {
  const { data, loading } = useServiceStatus();
  const display: DisplayStatus = data ? overallToDisplay(data.overall) : "unavailable";
  const tone = toneForStatus(display);
  const label = loading ? "Checking" : display === "operational" ? "Online" : STATUS_LABEL[display];

  return (
    <span
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[0.8125rem] font-semibold",
        TONE_BADGE[tone]
      )}
      title={data ? `Overall status: ${STATUS_LABEL[display]}` : "Status is currently unavailable"}
    >
      <span aria-hidden="true" className={cn("size-2 rounded-full", TONE_DOT[tone], display === "operational" && "animate-pulse-ring")} />
      <span className="sr-only">Looking Glass status: </span>
      {label}
    </span>
  );
}
