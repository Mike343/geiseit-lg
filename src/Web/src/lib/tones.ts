import type { ComponentStatus } from "@/lib/api/types";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "brand";

export const TONE_BADGE: Record<Tone, string> = {
  success: "bg-success-soft text-success border-success-line",
  warning: "bg-warning-soft text-warning border-warning-line",
  danger: "bg-danger-soft text-danger border-danger-line",
  info: "bg-info-soft text-info border-info-line",
  neutral: "bg-neutral-soft text-neutral border-neutral-line",
  brand: "bg-brand-soft text-brand-fg border-transparent"
};

export const TONE_TEXT: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-neutral",
  brand: "text-brand-fg"
};

export const TONE_DOT: Record<Tone, string> = {
  success: "bg-success-solid",
  warning: "bg-warning-solid",
  danger: "bg-danger-solid",
  info: "bg-info",
  neutral: "bg-fg-3",
  brand: "bg-brand"
};

export type DisplayStatus = ComponentStatus | "unavailable";

export function toneForStatus(status: DisplayStatus): Tone {
  switch (status) {
    case "operational":
      return "success";
    case "degraded":
      return "warning";
    case "outage":
      return "danger";
    default:
      return "neutral";
  }
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  outage: "Outage",
  notConfigured: "Not configured",
  unavailable: "Unavailable"
};
